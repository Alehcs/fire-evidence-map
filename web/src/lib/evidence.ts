// Deterministic evidence logic: distance to evidence, coverage class, ranking, comparability.
// No model output is involved here; every rule is spelled out so it can be audited.
import type { Investigation, TestRec } from '../data'

export type Phase = 'solid' | 'droplet' | 'gas' | 'other'
export const PHASES: Phase[] = ['solid', 'droplet', 'gas', 'other']
export const PHASE_LABEL: Record<Phase, string> = {
  solid: 'Solid materials',
  droplet: 'Liquid droplets',
  gas: 'Gaseous flames',
  other: 'Smoke / aerosol',
}
export const phaseOf = (r: { fuel_phase: string }): Phase =>
  r.fuel_phase === 'solid' || r.fuel_phase === 'droplet' || r.fuel_phase === 'gas' ? r.fuel_phase : 'other'

export interface Target {
  o2: number // % by volume
  p: number // kPa
}

export const PRESETS: { key: string; label: string; note: string; target: Target }[] = [
  { key: 'iss', label: 'ISS', note: '21% oxygen at 14.7 psi', target: { o2: 21, p: 101.3 } },
  { key: 'moon', label: 'Moon Base', note: '30% oxygen at 10.2 psi, as the challenge statement expects', target: { o2: 30, p: 70.3 } },
  { key: 'suit', label: 'Spacesuit', note: '100% oxygen at 4.3 psi', target: { o2: 100, p: 29.6 } },
  { key: 'e1', label: '10.2 psi · 26.5%', note: 'A NASA-considered atmosphere for crewed missions, listed in the BRE record in PSI', target: { o2: 26.5, p: 70.3 } },
  { key: 'e2', label: '8.2 psi · 34%', note: 'A NASA-considered atmosphere for crewed missions, listed in the BRE record in PSI', target: { o2: 34, p: 56.5 } },
]

// One distance unit = 5 percentage points of O2 or 20 kPa (about 2.9 psi).
export const SCALE = { o2: 5, p: 20 }
export const MISSING_PRESSURE_PENALTY = 1
export const NEAR = { direct: 1, adjacent: 2 } // distance thresholds for "tested here" / "tested nearby"

export interface Pt {
  rec: TestRec
  o2: number
  p: number | null // null = pressure not in the PSI table
  assumed: boolean // O2 or pressure assumed from nominal cabin air
  approx: boolean // anything other than a per-test recorded value
}

export function expand(tests: TestRec[]): Pt[] {
  const out: Pt[] = []
  for (const r of tests) {
    if (!r.o2_values.length) continue
    const ps: (number | null)[] = r.pressure_values_kpa.length ? r.pressure_values_kpa : [null]
    const assumed = r.o2_basis === 'assumed_cabin' || r.pressure_basis === 'assumed_cabin'
    const approx = assumed || r.o2_basis !== 'recorded' || !(r.pressure_basis === 'recorded' || r.pressure_basis === 'nominal')
    for (const o2 of r.o2_values) for (const p of ps) out.push({ rec: r, o2, p, assumed, approx })
  }
  return out
}

export function dist(pt: { o2: number; p: number | null }, t: Target): number {
  const a = (pt.o2 - t.o2) / SCALE.o2
  // A record whose table gives no pressure cannot be closer than MISSING_PRESSURE_PENALTY units.
  const b = pt.p == null ? MISSING_PRESSURE_PENALTY : (pt.p - t.p) / SCALE.p
  return Math.hypot(a, b)
}

export type Cover = 'direct' | 'adjacent' | 'distant' | 'none'
export const COVER_LABEL: Record<Cover, string> = {
  direct: 'Tested here',
  adjacent: 'Tested nearby',
  distant: 'Only distant tests',
  none: 'No usable conditions',
}

export interface Nearest {
  pt: Pt | null
  d: number | null
  within1: number
  within2: number
  cover: Cover
  total: number
}

export function nearest(points: Pt[], t: Target): Nearest {
  let best: Pt | null = null
  let bd = Infinity
  let w1 = 0
  let w3 = 0
  for (const pt of points) {
    const d = dist(pt, t)
    if (d <= NEAR.direct) w1++
    if (d <= NEAR.adjacent) w3++
    // prefer points with a known pressure when distances tie
    if (d < bd - 1e-9 || (Math.abs(d - bd) < 1e-9 && best && best.p == null && pt.p != null)) {
      bd = d
      best = pt
    }
  }
  if (!best) return { pt: null, d: null, within1: 0, within2: 0, cover: 'none', total: 0 }
  // a record with no pressure in its table can be "nearby" at best, never "tested here"
  const cover: Cover = bd <= NEAR.direct && best.p != null ? 'direct' : bd <= NEAR.adjacent ? 'adjacent' : 'distant'
  return { pt: best, d: bd, within1: w1, within2: w3, cover, total: points.length }
}

export interface Ranked {
  inv: Investigation
  near: Nearest
  directness: number
  proximity: number
  coverage: number
  score: number
}

const TIER_SCORE: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.3 }
export const TIER_LABEL: Record<number, string> = {
  1: 'Core fire-safety study',
  2: 'Named fire-safety link',
  3: 'Background combustion science',
}
export const WEIGHTS = { directness: 0.4, proximity: 0.4, coverage: 0.2 }

export function rank(invs: Investigation[], pts: Pt[], t: Target): Ranked[] {
  const by = new Map<string, Pt[]>()
  for (const p of pts) {
    const a = by.get(p.rec.accession)
    if (a) a.push(p)
    else by.set(p.rec.accession, [p])
  }
  return invs
    .map((inv) => {
      const near = nearest(by.get(inv.accession) ?? [], t)
      const directness = TIER_SCORE[inv.tier] ?? 0.3
      const proximity = near.d == null ? 0 : Math.exp(-near.d / 2)
      const coverage = Math.min(1, Math.log10(1 + near.within2) / 2)
      const score = 100 * (WEIGHTS.directness * directness + WEIGHTS.proximity * proximity + WEIGHTS.coverage * coverage)
      return { inv, near, directness, proximity, coverage, score }
    })
    .sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------------- comparability
export type CheckStatus = 'match' | 'differ' | 'unknown'
export interface Check {
  label: string
  status: CheckStatus
  detail: string
  weight: 'blocking' | 'major' | 'minor'
}
export type Verdict = 'comparable' | 'partial' | 'not_comparable'
export const VERDICT_LABEL: Record<Verdict, string> = {
  comparable: 'Directly comparable',
  partial: 'Partially comparable',
  not_comparable: 'Not directly comparable',
}

function overlap(a: [number, number] | null, b: [number, number] | null, unit: string): { status: CheckStatus; detail: string } {
  const f = (r: [number, number]) => (r[0] === r[1] ? `${+r[0].toFixed(1)}${unit}` : `${+r[0].toFixed(1)}–${+r[1].toFixed(1)}${unit}`)
  if (!a || !b) return { status: 'unknown', detail: `${a ? f(a) : 'not in table'} vs ${b ? f(b) : 'not in table'}` }
  const ok = a[0] <= b[1] && b[0] <= a[1]
  return { status: ok ? 'match' : 'differ', detail: `${f(a)} vs ${f(b)}` }
}

export function compare(a: Investigation, b: Investigation): { checks: Check[]; verdict: Verdict; why: string } {
  const checks: Check[] = []
  const samePhase = a.fuel_phase === b.fuel_phase
  checks.push({ label: 'Fuel phase', weight: 'blocking', status: samePhase ? 'match' : 'differ', detail: `${a.fuel_phase} vs ${b.fuel_phase}` })
  checks.push({ label: 'Facility / apparatus', weight: 'major', status: a.facility === b.facility ? 'match' : 'differ', detail: `${a.facility} vs ${b.facility}` })
  const o2 = overlap(a.o2_range, b.o2_range, '%')
  checks.push({ label: 'Oxygen range tested', weight: 'major', ...o2 })
  const pr = overlap(a.pressure_range_kpa, b.pressure_range_kpa, ' kPa')
  checks.push({ label: 'Pressure range tested', weight: 'minor', ...pr })
  const fl = overlap(a.flow_range_cm_s, b.flow_range_cm_s, ' cm/s')
  checks.push({ label: 'Air-flow range', weight: 'minor', ...fl })
  const shared = a.fuels.filter((f) => b.fuels.includes(f))
  checks.push({
    label: 'Shared fuels / materials',
    weight: 'major',
    status: !a.fuels.length || !b.fuels.length ? 'unknown' : shared.length ? 'match' : 'differ',
    detail: shared.length ? shared.slice(0, 3).join(', ') : 'none in common',
  })
  const ga = a.granularity.join('+') || 'none'
  const gb = b.granularity.join('+') || 'none'
  checks.push({
    label: 'Table granularity',
    weight: 'minor',
    status: !a.n_records || !b.n_records ? 'unknown' : ga === gb ? 'match' : 'differ',
    detail: `${ga.replace('_', '-')} vs ${gb.replace('_', '-')}`,
  })
  const pil = a.pillars.filter((p) => b.pillars.includes(p))
  checks.push({ label: 'Fire-safety pillar', weight: 'minor', status: pil.length ? 'match' : 'differ', detail: `${a.pillars.join(', ')} vs ${b.pillars.join(', ')}` })

  const major = checks.filter((c) => c.weight === 'major')
  const majorMatch = major.filter((c) => c.status === 'match').length
  const majorDiffer = major.filter((c) => c.status === 'differ').length
  let verdict: Verdict
  let why: string
  if (!samePhase) {
    verdict = 'not_comparable'
    why = 'The fuels are in different phases, so the two investigations measure different physical processes. A difference in their results is not a contradiction.'
  } else if (majorMatch >= 2 && majorDiffer === 0) {
    verdict = 'comparable'
    why = 'Same fuel phase, with overlapping conditions on the main variables.'
  } else {
    verdict = 'partial'
    why = 'Same fuel phase, but at least one main variable differs or is missing from the tables. Compare trends, not absolute values.'
  }
  return { checks, verdict, why }
}
