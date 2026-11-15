import { useMemo, useState } from 'react'
import { fmt, type Dataset, type Investigation } from '../data'
import { VERDICT_LABEL, compare, type CheckStatus } from '../lib/evidence'

const ICON: Record<CheckStatus, string> = { match: '●', differ: '✕', unknown: '–' }
const WORD: Record<CheckStatus, string> = { match: 'Match', differ: 'Differ', unknown: 'Unknown' }
const VICON = { comparable: '●', partial: '◐', not_comparable: '✕' }
const range = (r: [number, number] | null, unit: string, d = 1) => (!r ? 'not in table' : r[0] === r[1] ? `${fmt(r[0], d)}${unit}` : `${fmt(r[0], d)}–${fmt(r[1], d)}${unit}`)

function Col({ inv }: { inv: Investigation }) {
  return (
    <div>
      <a href={`#/investigations/${inv.accession}`}>
        <b>{inv.short}</b>
      </a>
      <dl className="kv" style={{ marginTop: 8 }}>
        <dt>Fuel type</dt>
        <dd>{inv.fuel_phase}</dd>
        <dt>Fuels</dt>
        <dd>{inv.fuels.slice(0, 4).join(', ') || 'not in table'}</dd>
        <dt>Facility</dt>
        <dd>{inv.facility}</dd>
        <dt>Oxygen</dt>
        <dd>{range(inv.o2_range, '%')}</dd>
        <dt>Pressure</dt>
        <dd>{range(inv.pressure_range_kpa, ' kPa', 0)}</dd>
        <dt>Air flow</dt>
        <dd>{range(inv.flow_range_cm_s, ' cm/s')}</dd>
        <dt>Records</dt>
        <dd>{inv.n_records}</dd>
      </dl>
    </div>
  )
}

export default function Compare({ data }: { data: Dataset }) {
  const invs = useMemo(() => [...data.investigations].sort((a, b) => a.short.localeCompare(b.short)), [data])
  const [a, setA] = useState('PSI-25')
  const [b, setB] = useState('PSI-69')
  const ia = invs.find((i) => i.accession === a)!
  const ib = invs.find((i) => i.accession === b)!
  const res = useMemo(() => compare(ia, ib), [ia, ib])
  const pairs: [string, string, string][] = [
    ['PSI-25', 'PSI-99', 'BASS-II vs Saffire-II'],
    ['PSI-25', 'PSI-69', 'BASS-II vs FLEX'],
    ['PSI-69', 'PSI-39', 'FLEX vs CFI'],
    ['PSI-20', 'PSI-25', 'BRE vs BASS-II'],
  ]

  return (
    <section>
      <header className="view-head">
        <h1>Compare Investigations</h1>
        <p className="lede">
          Different results are not a contradiction if the experiments burned different things. Check before you compare.
        </p>
      </header>
      <div className="controls" style={{ marginBottom: 12 }}>
        <select value={a} onChange={(e) => setA(e.target.value)} aria-label="First investigation">
          {invs.map((i) => (
            <option key={i.accession} value={i.accession}>
              {i.short}
            </option>
          ))}
        </select>
        <span className="dim">against</span>
        <select value={b} onChange={(e) => setB(e.target.value)} aria-label="Second investigation">
          {invs.map((i) => (
            <option key={i.accession} value={i.accession}>
              {i.short}
            </option>
          ))}
        </select>
        <div className="chips">
          {pairs.map(([x, y, label]) => (
            <button key={label} className="chip" onClick={() => (setA(x), setB(y))}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className={`verdict ${res.verdict}`}>
          <i aria-hidden="true">{VICON[res.verdict]}</i> {VERDICT_LABEL[res.verdict]}
        </div>
        <p className="note" style={{ marginTop: 6 }}>
          {res.why}
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Variable</th>
                <th>Result</th>
                <th>
                  {ia.short} vs {ib.short}
                </th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {res.checks.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className={`ck ${c.status}`}>
                    <i aria-hidden="true">{ICON[c.status]}</i> {WORD[c.status]}
                  </td>
                  <td>{c.detail}</td>
                  <td className="dim">{c.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="foot">
          Rule: different fuel phase, not comparable. Same phase with two main variables matching and none differing, comparable. Otherwise
          partial. “Unknown”: the NASA table does not state it.
        </p>
      </div>

      <div className="card">
        <div className="grid-2">
          <Col inv={ia} />
          <Col inv={ib} />
        </div>
      </div>
    </section>
  )
}
