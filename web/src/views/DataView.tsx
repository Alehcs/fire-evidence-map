import { useMemo, useState } from 'react'
import { BASIS_LABEL, type Basis, type Dataset } from '../data'
import { SCALE, WEIGHTS } from '../lib/evidence'

const base = import.meta.env.BASE_URL
const FILES = [
  ['tests.csv', 'Unified test records, one row per PSI table row (CSV)'],
  ['tests.json', 'Same records with the full original row attached (JSON)'],
  ['investigations.json', '24 investigation records with conditions, variables and publications'],
  ['quality_report.json', 'Anomalies found in the source tables, with row numbers'],
  ['models.json', 'FLEX model metrics, held-out predictions and CFI-G ignition counts'],
]

export default function DataView({ data }: { data: Dataset }) {
  const [sev, setSev] = useState<'all' | 'warning'>('all')
  const basis = useMemo(() => {
    const c = (k: 'o2_basis' | 'pressure_basis' | 'flow_basis') => {
      const m: Record<string, number> = {}
      for (const t of data.tests) m[t[k]] = (m[t[k]] ?? 0) + 1
      return m
    }
    return { o2: c('o2_basis'), p: c('pressure_basis'), f: c('flow_basis') }
  }, [data])
  const findings = data.findings.filter((f) => sev === 'all' || f.severity === 'warning')

  return (
    <section>
      <header className="view-head">
        <h1>Data and Method</h1>
        <p className="lede">
          Everything here is computed from files you can download. No NASA value is overwritten.
        </p>
      </header>

      <div className="grid-2">
        <div className="card">
          <h2>Download the unified dataset</h2>
          <ul className="plain" style={{ gap: 8 }}>
            {FILES.map(([f, d]) => (
              <li key={f}>
                <a href={`${base}data/${f}`} download>
                  <b>{f}</b>
                </a>
                <div className="dim">{d}</div>
              </li>
            ))}
          </ul>
          <p className="foot">
            Source: {data.meta.source}. Built {data.meta.generated.slice(0, 10)}. PSI data is released under CC0-1.0; cite each investigation
            by its DOI.
          </p>
        </div>
        <div className="card">
          <h2>Where each value comes from</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Basis</th>
                  <th className="num">Oxygen</th>
                  <th className="num">Pressure</th>
                  <th className="num">Air flow</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(BASIS_LABEL) as Basis[]).map((k) => (
                  <tr key={k}>
                    <td>
                      {BASIS_LABEL[k]}
                    </td>
                    <td className="num">{basis.o2[k] ?? 0}</td>
                    <td className="num">{basis.p[k] ?? 0}</td>
                    <td className="num">{basis.f[k] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="chart-head">
          <h2>Anomalies found in the PSI source tables ({findings.length})</h2>
          <div className="seg small">
            <button className={sev === 'all' ? 'on' : ''} onClick={() => setSev('all')}>
              All
            </button>
            <button className={sev === 'warning' ? 'on' : ''} onClick={() => setSev('warning')}>
              Affects a value
            </button>
          </div>
        </div>
        <p className="note">Reported as found. Suspected errors are flagged and the original text is kept.</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Investigation</th>
                <th>Type</th>
                <th>What we found</th>
                <th>CSV rows</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={i}>
                  <td>{f.accession === 'ALL' ? 'All tables' : <a href={`#/investigations/${f.accession}`}>{data.investigations.find((x) => x.accession === f.accession)?.short ?? f.accession}</a>}</td>
                  <td className={`sev ${f.severity}`}>
                    <i aria-hidden="true">{f.severity === 'warning' ? '▲' : '○'}</i> {f.kind.replace(/_/g, ' ')}
                  </td>
                  <td>{f.detail}</td>
                  <td className="num dim">{f.rows.slice(0, 6).join(', ')}{f.rows.length > 6 ? '…' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>How the numbers are computed</h2>
          <ul className="plain" style={{ gap: 8, fontSize: 14 }}>
            <li>
              <b>Units.</b> Oxygen in % by volume, pressure in kPa.
            </li>
            <li>
              <b>Distance.</b> One step is {SCALE.o2} points of oxygen or {SCALE.p} kPa. Within 1 step: “tested here”. Within 2: “tested
              nearby”. A record with no pressure gets a 1-step penalty.
            </li>
            <li>
              <b>Ranking.</b> {WEIGHTS.directness * 100}% fire-safety directness, {WEIGHTS.proximity * 100}% closeness of the nearest test,{' '}
              {WEIGHTS.coverage * 100}% number of close tests.
            </li>
            <li>
              <b>Assumed cabin air.</b> Tests run in cabin air record no oxygen or pressure. We place them at 21% and 101.3 kPa and draw them
              hollow.
            </li>
            <li>
              <b>Model.</b> Scored only on tests it did not see, with whole test days held out.
            </li>
          </ul>
        </div>
        <div className="card">
          <h2>Use of super intelligence (SI)</h2>
          <ul className="plain" style={{ gap: 8, fontSize: 14 }}>
            <li>
              <b>Machine learning.</b> A gradient-boosted tree model predicts FLEX extinction diameters, with its error shown.
            </li>
            <li>
              <b>Language model.</b> The plain-language summaries of the 24 investigations were drafted by Claude from NASA’s text. Each
              quote is checked by code to appear in the PSI record.
            </li>
            <li>
              <b>Code.</b> Pipeline and interface written with an AI coding assistant (Claude), reviewed by the team.
            </li>
            <li>
              <b>Not SI.</b> Unit conversion, distance, ranking and the comparability verdict are fixed rules.
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
