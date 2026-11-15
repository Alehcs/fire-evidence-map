// Data contracts for the files produced by pipeline/build_dataset.py and pipeline/build_models.py
import { useEffect, useState } from 'react'

export type Basis = 'recorded' | 'nominal' | 'listed_set' | 'assumed_cabin' | 'display_reading' | 'not_in_table'

export interface TestRec {
  id: string
  accession: string
  investigation: string
  table: string
  csv_row: number
  granularity: 'test' | 'test_day' | 'matrix' | 'session'
  fuel_phase: string
  facility: string
  pillars: string[]
  tier: number
  fuel: string | null
  fuel_original: string | null
  geometry: string | null
  n_flames: number | null
  o2_values: number[]
  o2_basis: Basis
  o2_role: string | null
  o2_original: string | null
  pressure_values_kpa: number[]
  pressure_basis: Basis
  pressure_original: string | null
  flow_values_cm_s: number[]
  flow_basis: Basis
  flow_original: string | null
  flow_direction: string | null
  diluents: Record<string, number | null> | null
  outcome: string | null
  outcome_original: string | null
  measures: Record<string, any>
  notes: string[]
  original: Record<string, string>
  test_label?: string
}

export interface Variation {
  column: string
  filled: number
  unique: number
  kind: 'constant' | 'numeric' | 'identifier' | 'categorical'
  value?: string
  min?: number
  max?: number
  top?: [string, number][]
}

export interface Investigation {
  accession: string
  short: string
  title: string
  acronym: string | null
  doi: string | null
  license: string | null
  psi_url: string
  project_type: string
  platform: string | null
  start: string | null
  end: string | null
  sub_area: string | null
  hardware: string | null
  total_bytes: number
  objective: string | null
  approach: string | null
  hypothesis: string | null
  impacts: string | null
  contacts: { name: string; role: string | null }[]
  fuel_phase: string
  facility: string
  pillars: string[]
  tier: number
  tier_reason: string | null
  diagnostics: string[] | null
  publications: { title: string; authors: string; doi: string | null }[]
  tables: { file: string; rows: number; columns: string[]; variation: Variation[] }[]
  n_records: number
  n_flames: number | null
  granularity: string[]
  o2_range: [number, number] | null
  pressure_range_kpa: [number, number] | null
  flow_range_cm_s: [number, number] | null
  fuels: string[]
}

export interface Finding {
  accession: string
  table: string
  kind: string
  detail: string
  rows: number[]
  severity: 'note' | 'warning'
}

export interface Models {
  flex: {
    title: string
    n: number
    cv: string
    excluded: string
    metrics: Record<string, Record<string, number>>
    feature_importance: Record<string, number>
    domain: Record<string, [number, number]>
    partial_dependence: Record<string, Record<string, { x: number[]; y: number[]; n: number; tested_range: [number, number] }>>
    points: { id: string; fuel: string; o2: number; co2: number; he: number; p: number; d0: number; dext: number; outcome: string; pred: number }[]
    summary: { fuel: string; diluent: string; n: number; o2_min: number; o2_max: number; median_extinction_mm: number; burned_to_completion: number }[]
    caveats: string[]
  }
  cfig: {
    title: string
    n: number
    cells: { flame: string; p_kpa: number; o2_pct: number; n: number; hot: number; self_ext: number }[]
    points: { id: string; flame: string; fuel: string; o2: number; p: number; hot: number; outcome: string; end: string | null; burn: number | null }[]
    logistic: { accuracy: number; auc: number; baseline_accuracy: number; verdict: string; cv: string }
    caveats: string[]
  }
}

export interface VideoRec {
  test: string
  id: string | null
  material: string | null
  family: string | null
  o2: number | null
  o2_final: number | null
  air_display: string | null
  source_file: string
  duration: number
  lit_seconds: number
  first: number | null
  last: number | null
  peak: number
  speed: { pct_width_per_s: number; r2: number; seconds: number } | null
  curve: [number, number][]
}

export interface Dataset {
  meta: { generated: string; source: string; basis_vocabulary: Record<string, string>; n_records: number }
  tests: TestRec[]
  investigations: Investigation[]
  findings: Finding[]
  models: Models
  videos: { note: string; videos: VideoRec[]; unreadable: { test: string; source_file: string }[] } | null
  summaries: Record<string, { summary: string; relevance: string; quotes: string[] }>
}

async function get<T>(name: string): Promise<T> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
  if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`)
  return r.json()
}

export function useDataset(): { data: Dataset | null; error: string | null } {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([get<any>('tests.json'), get<any>('investigations.json'), get<any>('quality_report.json'), get<Models>('models.json'), get<any>('videos.json').catch(() => null), get<any>('summaries.json').catch(() => null)])
      .then(([t, i, q, m, v, s]) => setData({ meta: t.meta, tests: t.tests, investigations: i.investigations, findings: q.findings, models: m, videos: v, summaries: s?.summaries ?? {} }))
      .catch((e) => setError(String(e)))
  }, [])
  return { data, error }
}

export const BASIS_LABEL: Record<Basis, string> = {
  recorded: 'recorded per test',
  nominal: 'nominal value in table',
  listed_set: 'set / range listed in table',
  assumed_cabin: 'assumed cabin air (not in table)',
  display_reading: 'display reading, unit not stated',
  not_in_table: 'not in table',
}

export const fmt = (v: number | null | undefined, d = 1) => (v == null || Number.isNaN(v) ? '–' : v.toFixed(d).replace(/\.0+$/, ''))
export const kpaToPsi = (k: number) => k / 6.894757
