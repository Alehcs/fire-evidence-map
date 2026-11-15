import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { useGSAP } from '@gsap/react'
import { fmt, type Dataset } from '../data'
import GravityFlame from '../components/GravityFlame'
import { COVER_LABEL, PHASE_LABEL, PRESETS, SCALE, VERDICT_LABEL, compare, expand, nearest, phaseOf, type Cover, type Phase } from '../lib/evidence'

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, useGSAP)

const GUIDE = 'https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/'
const CHALLENGE = 'https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/'
const PHASE_CLASS: Record<Phase, string> = { gas: 's1', solid: 's2', droplet: 's3', other: 'sx' }
const COVER_ICON: Record<Cover, string> = { direct: '●', adjacent: '◐', distant: '○', none: '–' }

const MYTHS = [
  {
    was: 'A flame cannot survive in still air without gravity.',
    is: 'It can. A candle on Mir burned for over 45 minutes.',
    means: 'A fire in a dead-air corner may not die by itself.',
    inv: ['PSI-20', 'PSI-23', 'PSI-69'],
    src: 'NASA Researcher’s Guide, pp. 30, 35',
  },
  {
    was: 'A fire goes out when ventilation stops.',
    is: 'In BASS, a nitrogen jet pulled air in and kept the flame alive.',
    means: 'Where you aim the extinguisher matters.',
    inv: ['PSI-26', 'PSI-25'],
    src: 'NASA Researcher’s Guide, pp. 22, 31',
  },
  {
    was: 'Earth fire tests are conservative for space.',
    is: 'Materials can burn at lower oxygen in microgravity than on Earth.',
    means: 'The 1-g screening test may have less margin than assumed.',
    inv: ['PSI-26', 'PSI-25', 'PSI-69'],
    src: 'NASA Researcher’s Guide, pp. 12, 31, 36',
  },
]

const PILLARS = [
  {
    key: 'prevention',
    tone: 'ember',
    phase: 'solid' as Phase,
    title: 'Prevention',
    tagline: 'Pick materials that will not sustain a flame.',
    incident: ['1967 · Apollo 1', 'A flash fire swept a cabin filled with 100% oxygen.', 'https://sma.nasa.gov/sma-disciplines/accllp/apollo-1'],
    holds: ['PSI-26', 'PSI-25', 'PSI-98', 'PSI-99', 'PSI-100', 'PSI-20'],
  },
  {
    key: 'detection',
    tone: 'smoke',
    phase: 'other' as Phase,
    title: 'Detection',
    tagline: 'Spot a fire before it spreads.',
    incident: ['Artemis II', 'A smoke alarm sounded about 80,000 miles from home.', CHALLENGE],
    holds: ['PSI-102', 'PSI-101', 'PSI-47'],
  },
  {
    key: 'suppression',
    tone: 'blue',
    phase: 'droplet' as Phase,
    title: 'Suppression',
    tagline: 'Put it out without feeding it.',
    incident: ['1997 · Mir', 'An oxygen generator fire blocked the way to an escape vehicle.', 'https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/'],
    holds: ['PSI-69', 'PSI-26'],
  },
]

function MiniMap({ data }: { data: Dataset }) {
  const marks = useMemo(() => {
    const m = new Map<string, { o2: number; p: number; n: number; ph: Phase }>()
    for (const pt of expand(data.tests)) {
      if (pt.p == null) continue
      const ph = phaseOf(pt.rec)
      const o2 = Math.round(pt.o2)
      const p = Math.round(pt.p / 4) * 4
      const k = `${ph}|${o2}|${p}`
      const b = m.get(k)
      if (b) b.n++
      else m.set(k, { o2, p, n: 1, ph })
    }
    return [...m.values()].sort((a, b) => b.n - a.n)
  }, [data])
  const W = 640
  const H = 330
  const sx = (v: number) => 26 + ((v - 10) / 90) * (W - 52)
  const sy = (v: number) => H - 30 - ((Math.min(v, 340) - 20) / 320) * (H - 56)
  const t = PRESETS[1].target
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Preview of the evidence map: test records by oxygen and pressure, with the Moon Base atmosphere marked">
      {[21, 30, 50, 85].map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={14} y2={H - 30} stroke="rgba(255,255,255,0.08)" />
          <text x={sx(v)} y={H - 12} textAnchor="middle" fontSize="11" fill="#7d879b" fontFamily="var(--mono)">
            {v}% O2
          </text>
        </g>
      ))}
      {marks.map((b) => (
        <circle key={`${b.ph}${b.o2}${b.p}`} className={`mark solid-op ${PHASE_CLASS[b.ph]}`} cx={sx(b.o2)} cy={sy(b.p)} r={Math.min(11, 2.6 + 1.1 * Math.sqrt(b.n))} opacity={0.85} />
      ))}
      {[2, 1].map((k) => (
        <ellipse key={k} className={`ring ring-${k}`} cx={sx(t.o2)} cy={sy(t.p)} rx={sx(t.o2 + SCALE.o2 * k) - sx(t.o2)} ry={sy(t.p) - sy(t.p + SCALE.p * k)} />
      ))}
      <g className="target">
        <circle cx={sx(t.o2)} cy={sy(t.p)} r={6} />
        <path d={`M${sx(t.o2) - 12} ${sy(t.p)}h24M${sx(t.o2)} ${sy(t.p) - 12}v24`} />
        <text x={sx(t.o2) + 14} y={sy(t.p) + 24}>
          Moon Base air
        </text>
      </g>
    </svg>
  )
}

function MiniFlex({ data }: { data: Dataset }) {
  const pts = data.models.flex.points
  return (
    <svg viewBox="0 0 300 200" aria-hidden="true">
      {pts.map((p) => (
        <circle key={p.id} className={`mark solid-op ${p.co2 > 0 ? 's2' : p.he > 0 ? 's3' : 's1'}`} cx={10 + ((p.o2 - 10) / 26) * 280} cy={190 - (Math.min(p.dext, 5) / 5) * 180} r={3.4} />
      ))}
    </svg>
  )
}

const STEPS: { id: string; label: string; center?: boolean }[] = [
  { id: 'phase-top', label: 'Start' },
  { id: 'phase-how', label: 'Five questions' },
  { id: 'phase-myths', label: 'Belief 1 of 3' },
  { id: 'phase-myth-2', label: 'Belief 2 of 3', center: true },
  { id: 'phase-myth-3', label: 'Belief 3 of 3', center: true },
  { id: 'phase-finding', label: 'The finding' },
  { id: 'phase-pillars', label: 'Three pillars' },
  { id: 'phase-go', label: 'Explore', center: true },
]
const NAV_OFFSET = 108

// Scroll position for a step, from layout offsets only (never from transformed boxes), clamped to the page.
function anchorY(k: number): number {
  const st = STEPS[k]
  const el = document.getElementById(st.id)
  if (!el || k === 0) return 0
  let top = 0
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) top += n.offsetTop
  const max = document.documentElement.scrollHeight - window.innerHeight
  const y = st.center ? top + el.offsetHeight / 2 - window.innerHeight / 2 : top - NAV_OFFSET
  return Math.max(0, Math.min(max, Math.round(y)))
}

// One button that walks the page phase by phase, plus dots to jump to any phase.
function Guide() {
  const [idx, setIdx] = useState(0)
  const busy = useRef(false)
  const tween = useRef<gsap.core.Tween | null>(null)
  const sync = useRef<() => void>(() => {})

  useEffect(() => {
    const on = () => {
      if (busy.current) return
      const y = window.scrollY + window.innerHeight * 0.35
      const max = document.documentElement.scrollHeight - window.innerHeight
      let i = 0
      for (let k = 0; k < STEPS.length; k++) if (anchorY(k) <= y) i = k
      if (window.scrollY >= max - 2) i = STEPS.length - 1
      setIdx(i)
    }
    sync.current = on
    on()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      tween.current?.kill()
    }
  }, [])

  const go = (k: number) => {
    const y = anchorY(k)
    setIdx(k)
    tween.current?.kill()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, y)
      return
    }
    busy.current = true
    const done = () => {
      busy.current = false
      sync.current() // the scroll may have been interrupted: read the real position
    }
    const dist = Math.abs(y - window.scrollY)
    tween.current = gsap.to(window, {
      scrollTo: { y, autoKill: true },
      duration: Math.min(1.2, Math.max(0.55, dist / 2200)),
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: done,
      onInterrupt: done,
    })
  }
  useEffect(() => {
    guideGo = go
    return () => {
      guideGo = null
    }
  })

  const last = idx === STEPS.length - 1
  return (
    <>
      <ol className="guide-dots" aria-label="Page phases">
        {STEPS.map((st, k) => (
          <li key={st.id}>
            <button className={k === idx ? 'on' : ''} onClick={() => go(k)} aria-label={st.label} title={st.label} aria-current={k === idx ? 'step' : undefined} />
          </li>
        ))}
      </ol>
      <button className="guide-next" onClick={() => go(last ? 0 : idx + 1)}>
        {last ? (
          'Back to start'
        ) : (
          <>
            <span className="dim">Next</span> {STEPS[idx + 1].label}
          </>
        )}
        <i aria-hidden="true">{last ? '↑' : '↓'}</i>
      </button>
    </>
  )
}
let guideGo: ((k: number) => void) | null = null

export default function Overview({ data }: { data: Dataset }) {
  const root = useRef<HTMLDivElement>(null)
  const how = useRef<HTMLElement>(null)

  const s = useMemo(() => {
    const t = data.tests
    const real = (r: (typeof t)[number]) => r.o2_basis !== 'assumed_cabin' && r.o2_values.length > 0
    const range = (ph: string) => {
      const v = t.filter((r) => r.fuel_phase === ph && real(r)).flatMap((r) => r.o2_values)
      return { min: Math.min(...v), max: Math.max(...v) }
    }
    const pts = expand(t)
    const moon = PRESETS[1].target
    const byPhase = (ph: Phase) => nearest(pts.filter((p) => phaseOf(p.rec) === ph), moon)
    const ia = data.investigations.find((i) => i.accession === 'PSI-25')!
    const ib = data.investigations.find((i) => i.accession === 'PSI-69')!
    return {
      inv: data.investigations.length,
      tables: data.investigations.reduce((a, i) => a + i.tables.length, 0),
      records: t.length,
      findings: data.findings.length,
      solid: range('solid'),
      droplet: range('droplet'),
      gas: range('gas'),
      near: { solid: byPhase('solid'), droplet: byPhase('droplet'), gas: byPhase('gas'), other: byPhase('other') } as Record<Phase, ReturnType<typeof nearest>>,
      verdict: compare(ia, ib).verdict,
      r2: data.models.flex.metrics.gradient_boosting_grouped_by_test_day.r2,
    }
  }, [data])

  const name = (acc: string) => data.investigations.find((i) => i.accession === acc)?.short ?? acc
  const names = useMemo(() => data.investigations.filter((i) => i.n_records > 0).map((i) => i.short), [data])
  const pos = (v: number) => `${((v - 10) / 90) * 100}%`
  const bars: { ph: Phase; cls: string; r: { min: number; max: number } }[] = [
    { ph: 'solid', cls: 's2', r: s.solid },
    { ph: 'droplet', cls: 's3', r: s.droplet },
    { ph: 'gas', cls: 's1', r: s.gas },
  ]
  const statement = `The Moon Base is expected to run at 30% oxygen or more. NASA tested droplets and gas flames in that air. No solid material was burned above ${fmt(s.solid.max)}%.`

  useGSAP(
    () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduce) return
      gsap.from('.rise', { y: 26, opacity: 0, duration: 1, stagger: 0.09, ease: 'power3.out' })
      // Scrubbing text reveal
      gsap.fromTo('.scrub .w', { opacity: 0.14 }, { opacity: 1, stagger: 0.08, ease: 'none', scrollTrigger: { trigger: '.scrub', start: 'top 82%', end: 'bottom 62%', scrub: true } })
      gsap.from('.gapbar .fill', { scaleX: 0, duration: 1.1, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: '.gapbar', start: 'top 82%' } })
      gsap.from('.bento .b', { y: 34, opacity: 0, duration: 0.9, stagger: 0.07, ease: 'power3.out', scrollTrigger: { trigger: '.bento', start: 'top 85%' } })
      // The left title of the "proved wrong" section holds with CSS position: sticky (see theme.css);
      // the cards fade up as they arrive.
      const mm = gsap.matchMedia()
      mm.add('(min-width: 900px)', () => {
        gsap.utils.toArray<HTMLElement>('.myth').forEach((el) => {
          gsap.fromTo(el, { opacity: 0.3 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: el, start: 'top 92%', end: 'top 55%', scrub: true } })
        })
      })
    },
    { scope: root },
  )

  return (
    <div ref={root}>
      <Guide />
      <section className="hero wrap" id="phase-top">
        <div className="hero-grid">
          <div>
            <h1 className="rise">
              The evidence map for <span className="flame-pill" aria-hidden="true" /> fire safety in space.
            </h1>
            <p className="sub rise">
              One comparable dataset of NASA’s microgravity fire experiments. Pick the air of a spacecraft, Moon base or rover and see
              the closest real test.
            </p>
            <div className="btn-row rise">
              <a className="btn primary" href="#/map">
                Explore the map <span className="arrow">→</span>
              </a>
              <button className="btn secondary" onClick={() => guideGo?.(1)}>
                See how it works
              </button>
            </div>
          </div>
          <div className="rise">
            <GravityFlame />
          </div>
        </div>
      </section>

      <section className="sec wrap" ref={how}>
        <div className="sec-head" id="phase-how">
          <h2>Five questions, answered from the tests.</h2>
          <p>
            NASA publishes each experiment in its own table, with its own units. We merged them into one.
          </p>
        </div>
        <div className="bento">
          <a className="b b-a" href="#/map">
            <h3>How close is the nearest real test?</h3>
            <p>
              Set oxygen and pressure. Each mark is a NASA test.
            </p>
            <div className="viz">
              <MiniMap data={data} />
            </div>
            <span className="go">
              Open the map <i>→</i>
            </span>
          </a>
          <a className="b b-b" href="#/investigations">
            <h3>What did NASA burn?</h3>
            <div className="bignum">
              <div>
                <b>{s.inv}</b>
                <span>investigations</span>
              </div>
              <div>
                <b>{s.tables}</b>
                <span>source tables</span>
              </div>
              <div>
                <b>{s.records.toLocaleString()}</b>
                <span>test records</span>
              </div>
            </div>
            <span className="go">
              Browse investigations <i>→</i>
            </span>
          </a>
          <a className="b b-c" href="#/limits">
            <h3>When does a flame go out?</h3>
            <p>Limits read from the tests, plus a model checked on unseen tests (R² {fmt(s.r2, 2)}).</p>
            <div className="viz">
              <MiniFlex data={data} />
            </div>
            <span className="go">
              See flammability limits <i>→</i>
            </span>
          </a>
          <a className="b b-d" href="#/compare">
            <h3>Can two experiments be compared?</h3>
            <div className="vs">
              <span>BASS-II</span>
              <em>vs</em>
              <span>FLEX</span>
            </div>
            <p>
              {VERDICT_LABEL[s.verdict]}. One burned solids, the other droplets.
            </p>
            <span className="go">
              Compare any two <i>→</i>
            </span>
          </a>
          <a className="b b-e" href="#/data">
            <h3>Where does each number come from?</h3>
            <p>Every value keeps its original row. {s.findings} source anomalies are flagged, none silently fixed.</p>
            <div className="prov">
              <div>
                <span className="from">FLEX · 534.4 mmHg</span>
                <i>→</i>
                <span className="to">71.2 kPa</span>
              </div>
              <div>
                <span className="from">CFI-G · XO2 0.85</span>
                <i>→</i>
                <span className="to">85% oxygen</span>
              </div>
              <div>
                <span className="from">ACME BRE · “3400%”</span>
                <i>→</i>
                <span className="to">34%, flagged</span>
              </div>
            </div>
            <span className="go">
              Get the dataset <i>→</i>
            </span>
          </a>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[...names, ...names].map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </div>
      </div>

      <section className="sec wrap">
        <div className="pin-wrap" id="phase-myths">
          <div className="pin-left">
            <h2>Three Earth rules about fire that space proved wrong.</h2>
            <p>
              NASA calls them critical misconceptions about spacecraft fires.
            </p>
            <p>
              <a href={GUIDE} target="_blank" rel="noreferrer">
                Source: A Researcher’s Guide to Combustion Science
              </a>
            </p>
          </div>
          <div className="pin-right">
            {MYTHS.map((m, k) => (
              <article className="myth" key={m.was} id={k ? `phase-myth-${k + 1}` : undefined}>
                <p className="was">{m.was}</p>
                <p className="is">{m.is}</p>
                <p className="means">{m.means}</p>
                <div className="chips">
                  {m.inv.map((a) => (
                    <a key={a} className="chip" href={`#/investigations/${a}`}>
                      {name(a)}
                    </a>
                  ))}
                </div>
                <span className="src">{m.src}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec wrap">
        <p className="scrub" id="phase-finding">
          {statement.split(' ').map((w, i) => (
            <span key={i} className={`w ${/\d+(\.\d+)?%\.$/.test(w) && i > 20 ? 'hot' : ''}`}>
              {w}{' '}
            </span>
          ))}
        </p>
        <div className="gapbar" role="img" aria-label={`Oxygen ranges tested. Solid materials ${fmt(s.solid.min)} to ${fmt(s.solid.max)} percent, droplets ${fmt(s.droplet.min)} to ${fmt(s.droplet.max)} percent, gas flames ${fmt(s.gas.min)} to ${fmt(s.gas.max)} percent.`}>
          {bars.map(({ ph, cls, r }) => (
            <div className="row" key={ph}>
              <span>{PHASE_LABEL[ph]}</span>
              <div className="track">
                <div className={`fill ${cls}`} style={{ left: pos(r.min), width: `calc(${pos(r.max)} - ${pos(r.min)})` }} />
                <div className="mk" style={{ left: pos(30) }} />
              </div>
              <span className="num">{fmt(r.max, 0)}%</span>
            </div>
          ))}
          <div className="row">
            <span />
            <div className="axis-row">
              <span style={{ left: pos(10) }}>10</span>
              <span style={{ left: pos(21) }}>21</span>
              <span style={{ left: pos(30) }}>30% Moon Base</span>
              <span style={{ left: pos(85) }}>85</span>
              <span style={{ left: pos(100) }}>100</span>
            </div>
            <span />
          </div>
        </div>
        <p className="foot">
          Oxygen range of the tests that state an oxygen value. The BASS table states none; NASA reports it ran at 17% to 21%.
        </p>
      </section>

      <section className="sec wrap">
        <div className="sec-head" id="phase-pillars">
          <h2>Three jobs of fire safety. How much evidence for the Moon?</h2>
          <p>Hover a column to open it.</p>
        </div>
        <div className="acc">
          {PILLARS.map((p, i) => {
            const near = s.near[p.phase]
            return (
              <article key={p.key} className={`acc-item ${p.tone} ${i === 0 ? 'open' : ''}`} tabIndex={0}>
                <h3>{p.title}</h3>
                <p className="tagline">{p.tagline}</p>
                <div className="acc-body">
                  <p>
                    <b>{p.incident[0]}.</b> {p.incident[1]}{' '}
                    <a href={p.incident[2]} target="_blank" rel="noreferrer">
                      Source
                    </a>
                  </p>
                  <p>
                    <b>In Moon Base air:</b>{' '}
                    <span className={`status ${near.cover}`}>
                      <i aria-hidden="true">{COVER_ICON[near.cover]}</i> {COVER_LABEL[near.cover]}
                    </span>
                    <br />
                    Nearest {PHASE_LABEL[p.phase].toLowerCase()} test: {near.pt ? `${near.pt.rec.investigation} at ${fmt(near.pt.o2)}% oxygen` : 'none'}
                    {near.pt?.assumed ? ' in cabin air' : near.pt?.p != null ? `, ${fmt(near.pt.p, 0)} kPa` : ''}.
                  </p>
                  <div className="chips">
                    {p.holds.map((a) => (
                      <a key={a} className="chip" href={`#/investigations/${a}`}>
                        {name(a)}
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="action wrap">
        <h2 id="phase-go">Pick an atmosphere. See the evidence.</h2>
        <p>Every mark is a real NASA test. Every gap is an open question.</p>
        <div className="btn-row">
          <a className="btn primary" href="#/map">
            Explore the map <span className="arrow">→</span>
          </a>
          <a className="btn secondary" href="#/data">
            Get the dataset
          </a>
        </div>
      </section>
    </div>
  )
}
