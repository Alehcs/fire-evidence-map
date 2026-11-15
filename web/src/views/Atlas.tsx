import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, type Dataset, type Investigation } from '../data'
import { TIER_LABEL } from '../lib/evidence'

const PILLARS = ['all', 'prevention', 'detection', 'suppression', 'foundational']
const range = (r: [number, number] | null, unit: string, d = 1) => (!r ? 'not in table' : r[0] === r[1] ? `${fmt(r[0], d)}${unit}` : `${fmt(r[0], d)}–${fmt(r[1], d)}${unit}`)
const size = (b: number) => (b > 1e12 ? `${fmt(b / 1e12, 2)} TB` : b > 1e9 ? `${fmt(b / 1e9, 1)} GB` : b > 1e6 ? `${fmt(b / 1e6, 0)} MB` : `${fmt(b / 1e3, 0)} kB`)

function Detail({ inv, data }: { inv: Investigation; data: Dataset }) {
  const findings = data.findings.filter((f) => f.accession === inv.accession)
  const summary = data.summaries[inv.accession]
  return (
    <div className="card">
      <p style={{ marginBottom: 10 }}>
        <a href="#/investigations" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          ↑ All investigations
        </a>
      </p>
      <div className="chart-head">
        <div>
          <span className="kicker">
            {inv.accession} · {inv.project_type}
          </span>
          <h2 style={{ fontSize: 22, marginTop: 2 }}>{inv.title}</h2>
        </div>
        <div className="chips">
          {inv.pillars.map((p) => (
            <span className="chip" key={p}>
              {p}
            </span>
          ))}
          <span className="chip">{TIER_LABEL[inv.tier]}</span>
        </div>
      </div>
      {inv.tier_reason && <p className="note">{inv.tier_reason}</p>}
      {summary && (
        <div className="si">
          <h3>In plain words</h3>
          <p>{summary.summary}</p>
          <p>
            <b>Fire-safety relevance:</b> {summary.relevance}
          </p>
          {summary.quotes.map((q) => (
            <blockquote key={q}>NASA’s record: “{q}”</blockquote>
          ))}
          <span className="dim">Written by an AI model (Claude) from NASA’s text. The quote is checked to appear in the PSI record.</span>
        </div>
      )}
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <h3>What was tested</h3>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>Fuel type</dt>
            <dd>{inv.fuel_phase}</dd>
            <dt>Fuels / materials</dt>
            <dd>{inv.fuels.length ? inv.fuels.slice(0, 6).join(', ') : 'not in table'}</dd>
            <dt>Facility</dt>
            <dd>{inv.facility}</dd>
            <dt>Hardware (PSI)</dt>
            <dd>{inv.hardware || '–'}</dd>
            <dt>Diagnostics</dt>
            <dd>{inv.diagnostics ? `${inv.diagnostics.join(', ')} (facility-level, Researcher’s Guide appendix)` : 'see PSI documents'}</dd>
            <dt>Oxygen</dt>
            <dd>{range(inv.o2_range, '%')}</dd>
            <dt>Pressure</dt>
            <dd>{range(inv.pressure_range_kpa, ' kPa', 0)}</dd>
            <dt>Air flow</dt>
            <dd>{range(inv.flow_range_cm_s, ' cm/s')}</dd>
            <dt>Records</dt>
            <dd>
              {inv.n_records} ({inv.granularity.join(', ').replace(/_/g, ' ') || 'no experimental table'})
              {inv.n_flames ? `, ${inv.n_flames} flames in day summaries` : ''}
            </dd>
          </dl>
        </div>
        <div>
          <h3>Source</h3>
          <dl className="kv" style={{ marginTop: 8 }}>
            <dt>PSI record</dt>
            <dd>
              <a href={inv.psi_url} target="_blank" rel="noreferrer">
                {inv.accession}
              </a>
            </dd>
            <dt>DOI</dt>
            <dd>
              {inv.doi ? (
                <a href={`https://doi.org/${inv.doi}`} target="_blank" rel="noreferrer">
                  {inv.doi}
                </a>
              ) : (
                '–'
              )}
            </dd>
            <dt>License</dt>
            <dd>{inv.license ?? '–'}</dd>
            <dt>Platform</dt>
            <dd>{inv.platform || '–'}</dd>
            <dt>Dates</dt>
            <dd>
              {inv.start ?? '?'} to {inv.end ?? '?'}
            </dd>
            <dt>Archive size</dt>
            <dd>{size(inv.total_bytes)}</dd>
            <dt>Team</dt>
            <dd>{inv.contacts.map((c) => `${c.name}${c.role ? ` (${c.role.replace(/ \(.*\)/, '')})` : ''}`).join('; ') || '–'}</dd>
          </dl>
        </div>
      </div>

      {inv.objective && (
        <>
          <h3 style={{ marginTop: 18 }}>Objective (PSI text)</h3>
          <p className="prose clamp">{inv.objective}</p>
        </>
      )}

      {inv.tables.map((t) => {
        const constant = t.variation.filter((v) => v.kind === 'constant')
        const varied = t.variation.filter((v) => v.kind === 'numeric' || v.kind === 'categorical')
        return (
          <div key={t.file} style={{ marginTop: 18 }}>
            <h3>How the tests differ: {t.file.replace(/^PSI-\d+_Experimental table_/, '').replace('.csv', '')}</h3>
            <p className="note">
              {t.rows} rows. {constant.length} column{constant.length === 1 ? '' : 's'} held constant, {varied.length} varied.
            </p>
            <div className="grid-2">
              <div>
                <b>Held the same</b>
                <ul className="plain dim" style={{ gap: 3, marginTop: 4 }}>
                  {constant.length ? constant.map((v) => <li key={v.column}>{v.column}: {v.value}</li>) : <li>nothing was constant across all rows</li>}
                </ul>
              </div>
              <div>
                <b>Varied</b>
                <ul className="plain dim" style={{ gap: 3, marginTop: 4 }}>
                  {varied.slice(0, 12).map((v) => (
                    <li key={v.column}>
                      {v.column}:{' '}
                      {v.kind === 'numeric' ? `${fmt(v.min!, 2)} to ${fmt(v.max!, 2)} (${v.unique} values)` : `${v.unique} values, e.g. ${v.top!.slice(0, 3).map((x) => x[0]).join(', ')}`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )
      })}

      {findings.length > 0 && (
        <>
          <h3 style={{ marginTop: 18 }}>Notes on the source table</h3>
          <ul className="plain dim" style={{ gap: 4, marginTop: 6 }}>
            {findings.map((f, i) => (
              <li key={i}>{f.detail}</li>
            ))}
          </ul>
        </>
      )}

      <h3 style={{ marginTop: 18 }}>Publications listed in PSI ({inv.publications.length})</h3>
      <ul className="plain" style={{ gap: 6, marginTop: 6, fontSize: 13.5 }}>
        {inv.publications.slice(0, 8).map((p, i) => (
          <li key={i}>
            {p.doi ? (
              <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                {p.title}
              </a>
            ) : (
              p.title
            )}
            <div className="dim">{p.authors}</div>
          </li>
        ))}
        {inv.publications.length > 8 && <li className="dim">and {inv.publications.length - 8} more on the PSI record</li>}
      </ul>
    </div>
  )
}

export default function Atlas({ data, selected }: { data: Dataset; selected: string | null }) {
  const [pillar, setPillar] = useState('all')
  const ref = useRef<HTMLDivElement>(null)
  const list = useMemo(
    () => data.investigations.filter((i) => pillar === 'all' || i.pillars.includes(pillar)).sort((a, b) => a.tier - b.tier || b.n_records - a.n_records),
    [data, pillar],
  )
  const inv = data.investigations.find((i) => i.accession === selected) ?? null
  useEffect(() => {
    if (inv) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [inv])

  return (
    <section>
      <header className="view-head">
        <h1>Investigations</h1>
        <p className="lede">All 24 NASA combustion investigations: what each burned, in what conditions, and how its tests differ.</p>
      </header>
      <div className="chips" style={{ marginBottom: 14 }}>
        {PILLARS.map((p) => (
          <button key={p} className={`chip ${pillar === p ? 'on' : ''}`} onClick={() => setPillar(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="inv-grid">
        {list.map((i) => (
          <a key={i.accession} href={`#/investigations/${i.accession}`} className={`inv-card ${selected === i.accession ? 'sel' : ''}`} style={{ textDecoration: 'none' }}>
            <span className="kicker">
              {i.accession} · {i.fuel_phase}
            </span>
            <span className="name">{i.short}</span>
            <span className="sum">{data.summaries[i.accession]?.summary ?? TIER_LABEL[i.tier]}</span>
            <span className="chips">
              {i.pillars.map((p) => (
                <span className="chip" key={p}>
                  {p}
                </span>
              ))}
            </span>
            <span className="dim">
              {i.n_records ? `${i.n_records} records` : 'no experimental table'} · O2 {range(i.o2_range, '%')}
            </span>
          </a>
        ))}
      </div>
      <div ref={ref} style={{ marginTop: 18, scrollMarginTop: 100 }}>
        {inv ? <Detail inv={inv} data={data} /> : <p className="note">Select an investigation to see its details.</p>}
      </div>
    </section>
  )
}
