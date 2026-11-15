import { useEffect, useState } from 'react'
import { useDataset } from './data'
import Overview from './views/Overview'
import EvidenceMap from './views/EvidenceMap'
import Flammability from './views/Flammability'
import Atlas from './views/Atlas'
import Compare from './views/Compare'
import DataView from './views/DataView'

const ROUTES = [
  { key: 'map', label: 'Evidence Map' },
  { key: 'limits', label: 'Flammability' },
  { key: 'investigations', label: 'Investigations' },
  { key: 'compare', label: 'Compare' },
  { key: 'data', label: 'Data' },
]

function useRoute(): [string, string | null] {
  const read = (): [string, string | null] => {
    const [a, b] = window.location.hash.replace(/^#\/?/, '').split('/')
    return [a ?? '', b ?? null]
  }
  const [r, setR] = useState(read)
  useEffect(() => {
    const on = () => {
      const next = read()
      setR((prev) => {
        if (prev[0] !== next[0]) window.scrollTo({ top: 0, behavior: 'instant' })
        return next
      })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

export default function App() {
  const { data, error } = useDataset()
  const [route, arg] = useRoute()
  const open = (acc: string) => (window.location.hash = `#/investigations/${acc}`)

  return (
    <>
      <header className="nav-pill">
        <a className="brand" href="#/" aria-label="Fire Evidence Map, home">
          <i className="brand-dot" aria-hidden="true" />
          <span>Fire Evidence Map</span>
        </a>
        <nav className="nav-links" aria-label="Sections">
          {ROUTES.map((r) => (
            <a key={r.key} href={`#/${r.key}`} className={route === r.key ? 'on' : ''}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="page">
        {error && <p className="loading">Could not load the dataset: {error}</p>}
        {!data && !error && <p className="loading">Loading NASA test records…</p>}
        {data && route === '' && <Overview data={data} />}
        {data && route !== '' && (
          <div className="wrap view">
            {route === 'map' && <EvidenceMap data={data} onOpen={open} />}
            {route === 'limits' && <Flammability data={data} />}
            {route === 'investigations' && <Atlas data={data} selected={arg} />}
            {route === 'compare' && <Compare data={data} />}
            {route === 'data' && <DataView data={data} />}
          </div>
        )}
      </main>
      <footer className="site">
        <div className="wrap foot-grid">
          <div>
            <p>
              Fire Evidence Map is a NASA Space Apps Challenge 2026 project for “Flame in Freefall”. It is not affiliated with or endorsed by
              NASA.
            </p>
            <p>Values marked as assumed or unverified are ours, not NASA statements. Illustrations are drawn by code; no NASA imagery or branding is used.</p>
          </div>
          <div>
            <b>Explore</b>
            <ul>
              {ROUTES.map((r) => (
                <li key={r.key}>
                  <a href={`#/${r.key}`}>{r.label}</a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <b>Sources</b>
            <ul>
              <li>
                <a href="https://psi.nasa.gov/physci/repo/search?q=combustion" target="_blank" rel="noreferrer">
                  NASA PSI data repository (CC0-1.0)
                </a>
              </li>
              <li>
                <a href="https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/" target="_blank" rel="noreferrer">
                  A Researcher’s Guide to Combustion Science
                </a>
              </li>
              <li>
                <a href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/" target="_blank" rel="noreferrer">
                  Flame in Freefall challenge statement
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </>
  )
}
