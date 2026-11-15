import { useMemo, useState } from 'react'
import { fmt, kpaToPsi, BASIS_LABEL, type Dataset } from '../data'
import { Legend, Plot, Shape, useTip, type ShapeKind } from '../components/Plot'
import { COVER_LABEL, PHASES, PHASE_LABEL, PRESETS, SCALE, TIER_LABEL, WEIGHTS, dist, expand, nearest, phaseOf, rank, type Cover, type Phase, type Pt, type Target } from '../lib/evidence'

export const PHASE_SHAPE: Record<Phase, ShapeKind> = { gas: 'circle', solid: 'square', droplet: 'triangle', other: 'diamond' }
export const PHASE_CLASS: Record<Phase, string> = { gas: 's1', solid: 's2', droplet: 's3', other: 'sx' }
const COVER_ICON: Record<Cover, string> = { direct: '●', adjacent: '◐', distant: '○', none: '–' }
const PILLARS = ['prevention', 'detection', 'suppression'] as const

interface Bubble {
  key: string
  phase: Phase
  o2: number
  p: number | null
  n: number
  assumed: boolean
  invs: Map<string, number>
  sample: Pt
}

function bubbles(pts: Pt[]): Bubble[] {
  const m = new Map<string, Bubble>()
  for (const pt of pts) {
    const phase = phaseOf(pt.rec)
    const o2 = Math.round(pt.o2 * 2) / 2
    const p = pt.p == null ? null : Math.round(pt.p / 2) * 2
    const key = `${phase}|${o2}|${p}|${pt.assumed}`
    let b = m.get(key)
    if (!b) m.set(key, (b = { key, phase, o2, p, n: 0, assumed: pt.assumed, invs: new Map(), sample: pt }))
    b.n++
    b.invs.set(pt.rec.investigation, (b.invs.get(pt.rec.investigation) ?? 0) + 1)
  }
  return [...m.values()].sort((a, b) => b.n - a.n)
}

// Plain-language gap between a test and the chosen atmosphere.
function gap(dO2: number, dP: number | null) {
  const a = Math.abs(dO2) < 0.5 ? 'Same oxygen' : `${fmt(Math.abs(dO2))} points ${dO2 > 0 ? 'more' : 'less'} oxygen`
  const b = dP == null ? 'pressure not in table' : Math.abs(dP) < 3 ? 'same pressure' : `${fmt(Math.abs(dP), 0)} kPa ${dP > 0 ? 'more' : 'less'} pressure`
  return `${a}, ${b}.`
}

export default function EvidenceMap({ data, onOpen }: { data: Dataset; onOpen: (acc: string) => void }) {
  const [target, setTarget] = useState<Target>(PRESETS[1].target)
  const [shown, setShown] = useState<Record<Phase, boolean>>({ solid: true, droplet: true, gas: true, other: true })
  const [pillar, setPillar] = useState<string>('all')
  const [all, setAll] = useState(false)
  const tip = useTip()

  const pts = useMemo(() => expand(data.tests), [data])
  const bub = useMemo(() => bubbles(pts), [pts])
  const byPhase = useMemo(() => {
    const o = {} as Record<Phase, Pt[]>
    for (const ph of PHASES) o[ph] = []
    for (const p of pts) o[phaseOf(p.rec)].push(p)
    return o
  }, [pts])
  const cover = useMemo(() => PHASES.map((ph) => ({ ph, near: nearest(byPhase[ph], target) })), [byPhase, target])
  const pillarCover = useMemo(
    () => PILLARS.map((pl) => ({ pl, near: nearest(pts.filter((p) => p.rec.pillars.includes(pl)), target) })),
    [pts, target],
  )
  const groups = useMemo(() => {
    const g: Record<'direct' | 'adjacent' | 'distant', string[]> = { direct: [], adjacent: [], distant: [] }
    for (const c of cover) g[c.near.cover === 'none' ? 'distant' : c.near.cover].push(PHASE_LABEL[c.ph].toLowerCase())
    return g
  }, [cover])
  const ranked = useMemo(() => rank(data.investigations, pts, target), [data, pts, target])
  const rankedShown = ranked.filter((r) => pillar === 'all' || r.inv.pillars.includes(pillar))
  const noO2 = data.tests.filter((t) => !t.o2_values.length).length
  const preset = PRESETS.find((p) => p.target.o2 === target.o2 && p.target.p === target.p)

  const X: [number, number] = [10, 100]
  const Y: [number, number] = [20, 340]

  return (
    <section>
      <header className="view-head">
        <h1>Evidence Map</h1>
        <p className="lede">How close is the nearest real test to your cabin air? Set oxygen and pressure to find out.</p>
      </header>

      <div className="controls">
        <div className="seg" role="group" aria-label="Atmosphere presets">
          {PRESETS.map((p) => (
            <button key={p.key} className={preset?.key === p.key ? 'on' : ''} onClick={() => setTarget(p.target)} title={p.note}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="slider">
          <span>
            Oxygen <b>{fmt(target.o2, 0)}%</b>
          </span>
          <input type="range" min={10} max={100} step={1} value={target.o2} onChange={(e) => setTarget({ ...target, o2: +e.target.value })} />
        </label>
        <label className="slider">
          <span>
            Pressure <b>{fmt(target.p, 1)} kPa</b> <i>({fmt(kpaToPsi(target.p), 1)} psi)</i>
          </span>
          <input type="range" min={25} max={330} step={0.5} value={target.p} onChange={(e) => setTarget({ ...target, p: +e.target.value })} />
        </label>
      </div>
      {preset && <p className="note">{preset.note}</p>}

      <div className="readout" aria-live="polite">
        {(['direct', 'adjacent', 'distant'] as const).map((k) => (
          <div key={k}>
            <span className={`status ${k}`}>
              <i aria-hidden="true">{COVER_ICON[k]}</i> {COVER_LABEL[k]}
            </span>
            <b className={groups[k].length ? '' : 'empty'}>{groups[k].length ? groups[k].join(', ') : 'none'}</b>
          </div>
        ))}
      </div>

      <div className="split">
        <div className="card chart" ref={tip.ref}>
          <div className="chart-head">
            <h2>NASA combustion tests, by oxygen and pressure</h2>
            <div className="toggles" role="group" aria-label="Fuel types shown">
              {PHASES.map((ph) => (
                <label key={ph}>
                  <input type="checkbox" checked={shown[ph]} onChange={(e) => setShown({ ...shown, [ph]: e.target.checked })} />
                  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <Shape kind={PHASE_SHAPE[ph]} cx={8} cy={8} r={5} className={PHASE_CLASS[ph]} />
                  </svg>
                  {PHASE_LABEL[ph]}
                </label>
              ))}
            </div>
          </div>
          <p className="note">Right: more oxygen. Up: more pressure. Bigger mark: more tests. The crosshair is your atmosphere.</p>
          <Plot
            title="Oxygen concentration versus pressure for PSI combustion test records, with the selected atmosphere marked"
            width={760}
            height={470}
            x={X}
            y={Y}
            xTicks={[10, 21, 30, 40, 50, 60, 70, 85, 100]}
            yTicks={[50, 100, 150, 200, 250, 300]}
            xLabel="Oxygen (% by volume)"
            yLabel="Pressure (kPa)"
            extraBottom={34}
            margin={{ t: 22, r: 64, b: 44, l: 54 }}
          >
            {(sx, sy, box) => (
              <>
                <text className="tick" x={box.x1 + 8} y={box.y1 - 8}>
                  psi
                </text>
                {[50, 100, 150, 200, 250, 300].map((v) => (
                  <text key={v} className="tick" x={box.x1 + 8} y={sy(v)} dy="0.32em">
                    {fmt(kpaToPsi(v), 1)}
                  </text>
                ))}
                <rect className="lane" x={box.x0} y={box.y0 + 24} width={box.x1 - box.x0} height={24} rx={4} />
                <text className="tick" x={box.x1 - 6} y={box.y0 + 40} textAnchor="end">
                  pressure not in the PSI table
                </text>
                {[2, 1].map((k) => (
                  <ellipse
                    key={k}
                    className={`ring ring-${k}`}
                    cx={sx(target.o2)}
                    cy={sy(target.p)}
                    rx={Math.abs(sx(target.o2 + SCALE.o2 * k) - sx(target.o2))}
                    ry={Math.abs(sy(target.p + SCALE.p * k) - sy(target.p))}
                    clipPath="inset(0)"
                  />
                ))}
                {bub
                  .filter((b) => shown[b.phase] && b.o2 >= X[0] && b.o2 <= X[1])
                  .map((b) => {
                    const cy = b.p == null ? box.y0 + 36 : sy(Math.min(Math.max(b.p, Y[0]), Y[1]))
                    const r = Math.min(15, 3.2 + 1.5 * Math.sqrt(b.n))
                    const d = dist(b, target)
                    return (
                      <Shape
                        key={b.key}
                        kind={PHASE_SHAPE[b.phase]}
                        cx={sx(b.o2)}
                        cy={cy}
                        r={r}
                        className={`${PHASE_CLASS[b.phase]} ${d <= 2 ? 'near' : ''}`}
                        hollow={b.assumed}
                        onMouseMove={(e: React.MouseEvent) =>
                          tip.show(
                            e,
                            <>
                              <b>
                                {b.n} record{b.n > 1 ? 's' : ''} · {PHASE_LABEL[b.phase]}
                              </b>
                              <span>
                                {fmt(b.o2)}% O2 · {b.p == null ? 'pressure not in table' : `${fmt(b.p, 0)} kPa (${fmt(kpaToPsi(b.p), 1)} psi)`}
                              </span>
                              <span>{[...b.invs.entries()].map(([k, v]) => `${k} (${v})`).join(', ')}</span>
                              {b.assumed && <span className="warn">Cabin air assumed: not stated in the table</span>}
                              {b.sample.rec.o2_role && b.sample.rec.o2_role !== 'ambient' && <span className="warn">O2 is the {b.sample.rec.o2_role}</span>}
                              <span className="dim">{fmt(d, 1)} steps from your atmosphere</span>
                            </>,
                          )
                        }
                        onMouseLeave={tip.hide}
                      />
                    )
                  })}
                {PRESETS.filter((p) => p !== preset).map((p) => (
                  <g key={p.key} className="preset-mark">
                    <path d={`M${sx(p.target.o2) - 5} ${sy(p.target.p)}h10M${sx(p.target.o2)} ${sy(p.target.p) - 5}v10`} />
                    <text x={sx(p.target.o2) + (p.target.o2 > 90 ? -8 : 8)} y={sy(p.target.p) - 7} textAnchor={p.target.o2 > 90 ? 'end' : 'start'}>
                      {p.label}
                    </text>
                  </g>
                ))}
                <g className="target">
                  <circle cx={sx(target.o2)} cy={sy(target.p)} r={7} />
                  <path d={`M${sx(target.o2) - 13} ${sy(target.p)}h26M${sx(target.o2)} ${sy(target.p) - 13}v26`} />
                  <text x={sx(target.o2) + (target.o2 > 80 ? -14 : 14)} y={sy(target.p) + 22} textAnchor={target.o2 > 80 ? 'end' : 'start'}>
                    {preset?.label ?? 'Your atmosphere'}
                  </text>
                </g>
              </>
            )}
          </Plot>
          {tip.layer}
          <Legend
            items={[
              { label: 'Stated in the NASA table', className: 'sx', kind: 'circle' },
              { label: 'Cabin air assumed', className: 'sx', kind: 'circle', hollow: true },
            ]}
          />
          <p className="foot">
            Rings: 1 and 2 steps from your atmosphere. One step is {SCALE.o2} points of oxygen or {SCALE.p} kPa. {noO2} records state no
            oxygen and are not shown.
          </p>
        </div>

        <aside className="stack">
          <div className="card">
            <h2>Nearest test by fuel type</h2>
            <ul className="cover-list">
              {cover.map(({ ph, near }) => (
                <li key={ph}>
                  <div className="cover-top">
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <Shape kind={PHASE_SHAPE[ph]} cx={8} cy={8} r={5} className={PHASE_CLASS[ph]} />
                    </svg>
                    <b>{PHASE_LABEL[ph]}</b>
                    <span className={`status ${near.cover}`}>
                      <i aria-hidden="true">{COVER_ICON[near.cover]}</i> {COVER_LABEL[near.cover]}
                    </span>
                  </div>
                  {near.pt && (
                    <p>
                      <button className="link" onClick={() => onOpen(near.pt!.rec.accession)}>
                        {near.pt.rec.investigation}
                      </button>{' '}
                      · {fmt(near.pt.o2)}% oxygen{near.pt.p != null ? ` · ${fmt(near.pt.p, 0)} kPa` : ''}
                      {near.pt.assumed ? ' (cabin air assumed)' : ''}
                      <br />
                      {gap(near.pt.o2 - target.o2, near.pt.p == null ? null : near.pt.p - target.p)}
                      {ph === 'solid' && (
                        <>
                          {' '}
                          <a href="#/limits">See the solid tests and videos</a>
                        </>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h2>By pillar</h2>
            <ul className="pillar-list">
              {pillarCover.map(({ pl, near }) => (
                <li key={pl}>
                  <b>{pl}</b>
                  <span className={`status ${near.cover}`}>
                    <i aria-hidden="true">{COVER_ICON[near.cover]}</i> {COVER_LABEL[near.cover]}
                  </span>
                  <span className="dim">{near.pt ? `${near.pt.rec.investigation}, ${fmt(near.d, 1)} steps away` : 'no conditions in the tables'}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="card">
        <div className="chart-head">
          <h2>Investigations ranked for this atmosphere</h2>
          <div className="seg small" role="group" aria-label="Pillar filter">
            {['all', ...PILLARS].map((p) => (
              <button key={p} className={pillar === p ? 'on' : ''} onClick={() => setPillar(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <p className="note">
          Score: {WEIGHTS.directness * 100}% how directly it addresses fire safety, {WEIGHTS.proximity * 100}% how close its nearest test is,{' '}
          {WEIGHTS.coverage * 100}% how many tests are close. Fixed rules, no language model.
          <span className="score-key">
            <i className="b1" /> directness <i className="b2" /> closeness <i className="b3" /> coverage
          </span>
        </p>
        <table className="rank">
          <thead>
            <tr>
              <th>#</th>
              <th>Investigation</th>
              <th>Role</th>
              <th>Nearest test</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {(all ? rankedShown : rankedShown.slice(0, 8)).map((r, i) => (
              <tr key={r.inv.accession}>
                <td className="num">{i + 1}</td>
                <td>
                  <button className="link" onClick={() => onOpen(r.inv.accession)}>
                    {r.inv.short}
                  </button>
                  <div className="dim">
                    {r.inv.accession} · {r.inv.pillars.join(', ')}
                  </div>
                </td>
                <td>
                  <div>{TIER_LABEL[r.inv.tier]}</div>
                  <div className="dim">{r.inv.fuel_phase} fuel · {r.inv.facility}</div>
                </td>
                <td>
                  {r.near.pt ? (
                    <>
                      {fmt(r.near.pt.o2)}% O2{r.near.pt.p != null ? `, ${fmt(r.near.pt.p, 0)} kPa` : ''}
                      <div className="dim">
                        {fmt(r.near.d, 1)} steps away · {BASIS_LABEL[r.near.pt.rec.pressure_basis === 'assumed_cabin' ? 'assumed_cabin' : r.near.pt.rec.o2_basis]}
                      </div>
                    </>
                  ) : (
                    <span className="dim">conditions not in table</span>
                  )}
                </td>
                <td className="num">
                  <div className="scorebar" title={`directness ${fmt(r.directness, 2)}, proximity ${fmt(r.proximity, 2)}, coverage ${fmt(r.coverage, 2)}`}>
                    <span style={{ width: `${WEIGHTS.directness * r.directness * 100}%` }} className="b1" />
                    <span style={{ width: `${WEIGHTS.proximity * r.proximity * 100}%` }} className="b2" />
                    <span style={{ width: `${WEIGHTS.coverage * r.coverage * 100}%` }} className="b3" />
                  </div>
                  {fmt(r.score, 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rankedShown.length > 8 && (
          <button className="ghost" onClick={() => setAll(!all)}>
            {all ? 'Show top 8' : `Show all ${rankedShown.length}`}
          </button>
        )}
      </div>
    </section>
  )
}
