import { useMemo, useState } from 'react'
import { fmt, type Dataset } from '../data'
import { Legend, Plot, Shape, useTip, type ShapeKind } from '../components/Plot'
import FlameLab from '../components/FlameLab'

const DIL: { key: string; label: string; cls: string; kind: ShapeKind }[] = [
  { key: 'N2 only', label: 'Nitrogen only', cls: 's1', kind: 'circle' },
  { key: 'CO2', label: 'CO2 added', cls: 's2', kind: 'square' },
  { key: 'He', label: 'Helium added', cls: 's3', kind: 'triangle' },
]
const dilOf = (p: { co2: number; he: number }) => (p.co2 > 0 ? 'CO2' : p.he > 0 ? 'He' : 'N2 only')

export default function Flammability({ data }: { data: Dataset }) {
  const { flex, cfig } = data.models
  const tipA = useTip()
  const tipB = useTip()
  const tipC = useTip()
  const tipD = useTip()
  const m = flex.metrics

  const solids = useMemo(
    () =>
      data.tests
        .filter((t) => t.fuel_phase === 'solid' && t.o2_values.length && t.flow_values_cm_s.length)
        .map((t) => ({ t, o2: t.o2_values[0], flow: t.flow_values_cm_s[0], sure: t.flow_basis === 'recorded' })),
    [data],
  )
  const [clip, setClip] = useState('B19')
  const hasVideo = useMemo(() => new Set((data.videos?.videos ?? []).filter((v) => v.lit_seconds >= 3).map((v) => v.test)), [data])
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const watch = (test: string) => {
    setClip(test)
    jump('sec-flames')
  }
  const o2Bins = [14, 18, 21, 30, 40, 50, 70, 85]
  const pBins = [300, 200, 100, 50]

  return (
    <section>
      <header className="view-head">
        <h1>Flammability Limits</h1>
        <p className="lede">
          When does it burn, and when does it go out? Three answers read straight from the tests.
        </p>
        <div className="chips" style={{ marginTop: 14 }}>
          {[
            ['sec-solids', 'Solid materials'],
            ['sec-flames', 'Real flames'],
            ['sec-droplets', 'Fuel droplets'],
            ['sec-model', 'Prediction'],
            ['sec-gas', 'Gas flames'],
          ].map(([id, label]) => (
            <button key={id} className="chip" onClick={() => jump(id)}>
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="card chart anchor" id="sec-solids" ref={tipA.ref}>
        <h2>Solid materials: every test is below 23% oxygen</h2>
        <p className="note">
          Each mark is one of {solids.length} solid-fuel tests. Marks with a white dot have video: click one to watch that flame.
        </p>
        <Plot title="Oxygen versus air speed for solid-fuel tests in PSI" width={980} height={380} x={[0, 55]} y={[10, 42]} xTicks={[0, 10, 20, 30, 40, 50]} yTicks={[15, 21, 30, 40]} xLabel="Air speed (cm/s)" yLabel="Oxygen (% by volume)">
          {(sx, sy, box) => (
            <>
              <rect className="gap-zone" x={box.x0} y={sy(42)} width={box.x1 - box.x0} height={sy(30) - sy(42)} />
              <line className="rule" x1={box.x0} x2={box.x1} y1={sy(30)} y2={sy(30)} />
              <text className="anno-strong" x={box.x0 + 10} y={sy(30) - 28}>
                Moon Base and rover air: 30% oxygen or more
              </text>
              <text className="anno" x={box.x0 + 10} y={sy(30) - 11}>
                No solid-material test in NASA’s tables
              </text>
              <rect className="band" x={sx(0)} y={box.y0 - 6} width={sx(30) - sx(0)} height={6} />
              <text className="anno" x={sx(15)} y={box.y0 - 11} textAnchor="middle">
                cabin ventilation, 0–30 cm/s
              </text>
              {[...solids]
                .sort((a, b) => Number(hasVideo.has(a.t.test_label ?? '')) - Number(hasVideo.has(b.t.test_label ?? '')))
                .map(({ t, o2, flow, sure }) => {
                  const vid = t.accession === 'PSI-25' && hasVideo.has(t.test_label ?? '')
                  return (
                <g key={t.id} className={vid ? 'has-video' : undefined} onClick={vid ? () => watch(t.test_label!) : undefined}>
                <Shape
                  kind={t.accession === 'PSI-25' ? 'square' : 'diamond'}
                  cx={sx(Math.min(flow, 55))}
                  cy={sy(o2)}
                  r={vid ? 7 : sure ? 6 : 4.5}
                  className="s2 solid-op"
                  hollow={!sure && !vid}
                  onMouseMove={(e: React.MouseEvent) =>
                    tipA.show(
                      e,
                      <>
                        <b>
                          {t.investigation} · {t.test_label ?? `row ${t.csv_row}`}
                        </b>
                        <span>{t.fuel_original}</span>
                        <span>
                          {fmt(o2)}% O2 · air {t.flow_original}
                        </span>
                        {t.measures.o2_final_pct != null && <span>Final O2 {fmt(t.measures.o2_final_pct)}%</span>}
                        {!sure && <span className="warn">Air display reading; unit not stated in the table</span>}
                        {vid && <b>Click to watch this flame</b>}
                      </>,
                    )
                  }
                  onMouseLeave={tipA.hide}
                />
                {vid && <circle className="vid-dot" cx={sx(Math.min(flow, 55))} cy={sy(o2)} r={2.6} />}
                </g>
                  )
                })}
            </>
          )}
        </Plot>
        {tipA.layer}
        <Legend
          items={[
            { label: 'BASS-II (air speed unit not stated)', className: 's2', kind: 'square', hollow: true },
            { label: 'Saffire-I and -II', className: 's2', kind: 'diamond' },
            { label: 'Has video: click to watch', className: 's2 vid', kind: 'square' },
          ]}
        />
        <p className="foot">
          BASS and Saffire-III state no oxygen in their tables and are not shown.
        </p>
      </div>

      <FlameLab data={data} sel={clip} onSel={setClip} />

      <div className="card anchor" id="sec-droplets">
        <h2>Fuel droplets: what puts the flame out</h2>
        <p className="note">
          Each point is a FLEX test. Higher on the chart means the flame went out sooner. Less oxygen and added CO2 push points up.
        </p>
        <div className="grid-2">
          {['Methanol', 'Heptane'].map((fuel, i) => {
            const tip = i === 0 ? tipB : tipC
            const pts = flex.points.filter((p) => p.fuel === fuel)
            return (
              <div key={fuel} ref={tip.ref} style={{ position: 'relative' }}>
                <h3>
                  {fuel} · {pts.length} tests
                </h3>
                <Plot title={`${fuel}: extinction diameter versus oxygen`} width={470} height={330} x={[10, 36]} y={[0, 5]} xTicks={[12, 18, 21, 24, 30, 34]} yTicks={[0, 1, 2, 3, 4, 5]} xLabel="Ambient oxygen (%)" yLabel="Extinction diameter (mm)">
                  {(sx, sy) =>
                    pts.map((p) => {
                      const d = DIL.find((x) => x.key === dilOf(p))!
                      return (
                        <Shape
                          key={p.id}
                          kind={d.kind}
                          cx={sx(p.o2)}
                          cy={sy(Math.min(p.dext, 5))}
                          r={4.5}
                          className={`${d.cls} solid-op`}
                          onMouseMove={(e: React.MouseEvent) =>
                            tip.show(
                              e,
                              <>
                                <b>{d.label}</b>
                                <span>
                                  {fmt(p.o2)}% O2{p.co2 ? ` · ${fmt(p.co2, 0)}% CO2` : ''}
                                  {p.he ? ` · ${fmt(p.he, 0)}% He` : ''} · {fmt(p.p, 0)} kPa
                                </span>
                                <span>
                                  Droplet {fmt(p.d0, 2)} mm → flame out at {fmt(p.dext, 2)} mm
                                </span>
                                <span className="dim">
                                  Model (held-out): {fmt(p.pred, 2)} mm · {p.outcome.replace(/_/g, ' ')}
                                </span>
                              </>,
                            )
                          }
                          onMouseLeave={tip.hide}
                        />
                      )
                    })
                  }
                </Plot>
                {tip.layer}
              </div>
            )
          })}
        </div>
        <Legend items={DIL.map((d) => ({ label: d.label, className: d.cls, kind: d.kind }))} />
      </div>

      <div className="grid-2">
        <div className="card anchor" id="sec-model">
          <h2>Can we predict it?</h2>
          <div className="grid-2" style={{ marginBottom: 12 }}>
            <div className="metric">
              <b>{fmt(m.gradient_boosting_grouped_by_test_day.r2 * 100, 0)}%</b>
              <span>of the variation explained (R² {fmt(m.gradient_boosting_grouped_by_test_day.r2, 2)}), on test days the model never saw</span>
            </div>
            <div className="metric">
              <b>± {fmt(m.gradient_boosting_grouped_by_test_day.mae, 2)} mm</b>
              <span>typical error ({fmt(m.baseline_predict_mean.mae_mean, 2)} mm when guessing the average)</span>
            </div>
            <div className="metric">
              <b>{fmt(m.initial_diameter_only.r2_mean * 100, 0)}%</b>
              <span>explained by droplet size alone; the atmosphere adds the rest</span>
            </div>
          </div>
          <p className="note">
            Gradient-boosted trees on oxygen, CO2, helium, pressure, droplet size and fuel, fitted to {flex.n} tests. Valid only for oxygen{' '}
            {flex.domain.o2.join('–')}% and pressure {flex.domain.p.map((v) => fmt(v, 0)).join('–')} kPa.
          </p>
          <ul className="plain dim" style={{ gap: 4 }}>
            <li>Fitted to NASA’s summary table, not the raw data.</li>
            <li>It says nothing about solid materials.</li>
          </ul>
        </div>
        <div className="card" ref={tipD.ref}>
          <h2>Predicted vs measured, on unseen tests</h2>
          <Plot title="Predicted versus measured extinction diameter" width={470} height={360} x={[0, 5]} y={[0, 5]} xTicks={[0, 1, 2, 3, 4, 5]} yTicks={[0, 1, 2, 3, 4, 5]} xLabel="Measured (mm)" yLabel="Predicted (mm)">
            {(sx, sy) => (
              <>
                <line className="axis" x1={sx(0)} y1={sy(0)} x2={sx(5)} y2={sy(5)} />
                {flex.points.map((p) => (
                  <Shape
                    key={p.id}
                    kind="circle"
                    cx={sx(Math.min(p.dext, 5))}
                    cy={sy(Math.min(Math.max(p.pred, 0), 5))}
                    r={4}
                    className="s1 solid-op"
                    onMouseMove={(e: React.MouseEvent) =>
                      tipD.show(
                        e,
                        <>
                          <b>{p.fuel}</b>
                          <span>
                            Measured {fmt(p.dext, 2)} mm · predicted {fmt(p.pred, 2)} mm
                          </span>
                          <span className="dim">
                            {fmt(p.o2)}% O2, {fmt(p.co2, 0)}% CO2, {fmt(p.he, 0)}% He
                          </span>
                        </>,
                      )
                    }
                    onMouseLeave={tipD.hide}
                  />
                ))}
              </>
            )}
          </Plot>
          {tipD.layer}
          <p className="foot">On the diagonal: a perfect prediction.</p>
        </div>
      </div>

      <div className="card anchor" id="sec-gas">
        <h2>Gas flames: hot ignition by oxygen and pressure</h2>
        <p className="note">
          Each cell: tests that ignited hot, out of tests run (ACME CFI-G). These reach Moon Base oxygen at low pressure, but they are gas
          flames, not materials.
        </p>
        <div className="grid-2">
          {['normal', 'inverse'].map((flame) => (
            <div key={flame}>
              <h3>
                {flame} flames · {cfig.points.filter((p) => p.flame === flame).length} tests
              </h3>
              <div className="table-wrap">
                <table className="heat" aria-label={`${flame} flame hot-ignition counts by pressure and oxygen`}>
                  <thead>
                    <tr>
                      <th>Pressure</th>
                      {o2Bins.map((o) => (
                        <th key={o} className="num">
                          {o}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pBins.map((p) => (
                      <tr key={p}>
                        <td className="num">~{p} kPa</td>
                        {o2Bins.map((o) => {
                          const c = cfig.cells.find((x) => x.flame === flame && x.p_kpa === p && x.o2_pct === o)
                          if (!c) return <td key={o} className="num dim">·</td>
                          const f = c.hot / c.n
                          const step = Math.min(5, Math.floor(f * 5.999))
                          return (
                            <td key={o} className="num" title={`${c.hot} of ${c.n} tests ignited hot; ${c.self_ext} self-extinguished`}>
                              <span className={`cell-label hc hc${step}`}>
                                {c.hot}/{c.n}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <p className="foot heat-legend">
          Share that ignited: few <i className="hc hc0" /> <i className="hc hc2" /> <i className="hc hc3" /> <i className="hc hc5" /> all. Dot: no test. Moon Base air
          (30% oxygen, 70 kPa) sits between the 50 and 100 kPa rows.
        </p>
        <ul className="plain dim" style={{ gap: 4 }}>
          <li>“No hot ignition” can still mean a cool flame.</li>
          <li>Inverse flames: the oxygen value is the burner stream, not cabin air.</li>
        </ul>
      </div>
    </section>
  )
}
