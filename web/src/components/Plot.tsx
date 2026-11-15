import { useCallback, useRef, useState, type ReactNode } from 'react'

export type Scale = (v: number) => number
export const linear = (d0: number, d1: number, r0: number, r1: number): Scale => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)

interface PlotProps {
  width?: number
  height?: number
  x: [number, number]
  y: [number, number]
  xTicks: number[]
  yTicks: number[]
  xLabel: string
  yLabel: string
  xFormat?: (v: number) => string
  yFormat?: (v: number) => string
  margin?: { t: number; r: number; b: number; l: number }
  extraBottom?: number // room for a lane under the x axis
  title: string // accessible name
  children: (sx: Scale, sy: Scale, box: { x0: number; x1: number; y0: number; y1: number }) => ReactNode
}

export function Plot({ width = 720, height = 420, x, y, xTicks, yTicks, xLabel, yLabel, xFormat, yFormat, margin, extraBottom = 0, title, children }: PlotProps) {
  const m = margin ?? { t: 14, r: 18, b: 44, l: 54 }
  const x0 = m.l
  const x1 = width - m.r
  const y0 = height - m.b - extraBottom
  const y1 = m.t
  const sx = linear(x[0], x[1], x0, x1)
  const sy = linear(y[0], y[1], y0, y1)
  return (
    <div className="plot-wrap">
    <svg className="plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line className="grid" x1={x0} x2={x1} y1={sy(t)} y2={sy(t)} />
          <text className="tick" x={x0 - 8} y={sy(t)} dy="0.32em" textAnchor="end">
            {yFormat ? yFormat(t) : t}
          </text>
        </g>
      ))}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line className="grid" x1={sx(t)} x2={sx(t)} y1={y0} y2={y1} />
          <text className="tick" x={sx(t)} y={y0 + 16} textAnchor="middle">
            {xFormat ? xFormat(t) : t}
          </text>
        </g>
      ))}
      <line className="axis" x1={x0} x2={x1} y1={y0} y2={y0} />
      <text className="axis-label" x={(x0 + x1) / 2} y={height - 6} textAnchor="middle">
        {xLabel}
      </text>
      <text className="axis-label" transform={`translate(13 ${(y0 + y1) / 2}) rotate(-90)`} textAnchor="middle">
        {yLabel}
      </text>
      {children(sx, sy, { x0, x1, y0, y1 })}
    </svg>
    </div>
  )
}

export type ShapeKind = 'circle' | 'square' | 'triangle' | 'diamond'

export function Shape({ kind, cx, cy, r, className, hollow, ...rest }: { kind: ShapeKind; cx: number; cy: number; r: number; className?: string; hollow?: boolean } & React.SVGProps<SVGElement>) {
  const cls = `mark ${className ?? ''} ${hollow ? 'hollow' : ''}`
  const p = rest as any
  if (kind === 'square') return <rect className={cls} x={cx - r * 0.89} y={cy - r * 0.89} width={r * 1.78} height={r * 1.78} rx={1.5} {...p} />
  if (kind === 'triangle') {
    const h = r * 1.25
    return <path className={cls} d={`M${cx} ${cy - h}L${cx + h * 0.95} ${cy + h * 0.72}L${cx - h * 0.95} ${cy + h * 0.72}Z`} {...p} />
  }
  if (kind === 'diamond') {
    const h = r * 1.2
    return <path className={cls} d={`M${cx} ${cy - h}L${cx + h} ${cy}L${cx} ${cy + h}L${cx - h} ${cy}Z`} {...p} />
  }
  return <circle className={cls} cx={cx} cy={cy} r={r} {...p} />
}

// Hover tooltip shared by all charts ------------------------------------------------------------
export function useTip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  const show = useCallback((e: React.MouseEvent, body: ReactNode) => {
    const host = ref.current?.getBoundingClientRect()
    if (!host) return
    setTip({ x: e.clientX - host.left, y: e.clientY - host.top, body })
  }, [])
  const hide = useCallback(() => setTip(null), [])
  const layer = tip ? (
    <div className="tip" style={{ left: Math.min(tip.x + 14, (ref.current?.clientWidth ?? 600) - 250), top: tip.y + 14 }} role="status">
      {tip.body}
    </div>
  ) : null
  return { ref, show, hide, layer }
}

export function Legend({ items }: { items: { label: string; className: string; kind?: ShapeKind; hollow?: boolean }[] }) {
  return (
    <ul className="legend">
      {items.map((it) => (
        <li key={it.label}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <Shape kind={it.kind ?? 'circle'} cx={8} cy={8} r={5} className={it.className} hollow={it.hollow} />
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  )
}
