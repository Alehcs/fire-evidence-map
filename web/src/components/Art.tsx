// Decorative, code-drawn art: the scroll-driven backdrop flame and one illustration per fire-safety pillar.
// None of it is experimental footage; the site footer says so.
import { useEffect, useRef } from 'react'

// Fixed backdrop: an ember teardrop at the top of the page that becomes a blue freefall sphere at the bottom.
export function BackdropFlame() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const set = () => {
      raf = 0
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      const g = 1 - p * p * (3 - 2 * p) // smoothstep: 1 at the top (Earth gravity), 0 at the bottom (freefall)
      ref.current?.style.setProperty('--g', g.toFixed(4))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(set)
    }
    set()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div className="backdrop" ref={ref} aria-hidden="true">
      <i className="bd-tear" />
      <i className="bd-sphere" />
    </div>
  )
}

export function PillarArt({ kind }: { kind: 'prevention' | 'detection' | 'suppression' }) {
  if (kind === 'prevention')
    return (
      <svg className="acc-art" viewBox="0 0 400 220" aria-hidden="true">
        <defs>
          <radialGradient id="pa-f" cx="50%" cy="60%" r="50%">
            <stop offset="0%" stopColor="#fff3d0" />
            <stop offset="35%" stopColor="#ffb04a" />
            <stop offset="70%" stopColor="#ff6a1f" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ff6a1f" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="pa-m" x1="0" x2="1">
            <stop offset="0%" stopColor="#3a2a22" />
            <stop offset="42%" stopColor="#3a2a22" />
            <stop offset="50%" stopColor="#c8ccd6" />
            <stop offset="100%" stopColor="#c8ccd6" />
          </linearGradient>
          <filter id="pa-b" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        {/* a strip of material: burnt on the left, intact on the right */}
        <rect x="40" y="128" width="320" height="16" rx="4" fill="url(#pa-m)" opacity="0.85" />
        <g className="pa-flame">
          <ellipse cx="186" cy="118" rx="54" ry="20" fill="url(#pa-f)" filter="url(#pa-b)" />
          <ellipse cx="186" cy="150" rx="46" ry="13" fill="url(#pa-f)" filter="url(#pa-b)" opacity="0.7" />
          <ellipse cx="190" cy="122" rx="20" ry="7" fill="#fff6dc" filter="url(#pa-b)" />
        </g>
      </svg>
    )
  if (kind === 'detection')
    return (
      <svg className="acc-art" viewBox="0 0 400 220" aria-hidden="true">
        {/* smoke particles drifting toward a detector */}
        {[
          [60, 70, 5], [92, 128, 8], [120, 92, 3], [150, 150, 6], [176, 64, 4], [204, 118, 9], [232, 84, 3.5], [252, 146, 5],
          [84, 168, 3], [140, 44, 4.5], [214, 172, 3.5], [40, 120, 6.5],
        ].map(([x, y, r], i) => (
          <circle key={i} className="da-p" cx={x} cy={y} r={r} style={{ animationDelay: `${(i * 0.37) % 4}s` }} />
        ))}
        <g className="da-s">
          <circle cx="330" cy="110" r="42" />
          <circle cx="330" cy="110" r="27" />
          <circle cx="330" cy="110" r="12" />
          <circle className="da-dot" cx="330" cy="110" r="4" />
        </g>
      </svg>
    )
  return (
    <svg className="acc-art" viewBox="0 0 400 220" aria-hidden="true">
      <defs>
        <radialGradient id="sa-f" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4a8dff" stopOpacity="0.1" />
          <stop offset="55%" stopColor="#4a92ff" stopOpacity="0.25" />
          <stop offset="80%" stopColor="#a8d0ff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#3f7cff" stopOpacity="0" />
        </radialGradient>
        <filter id="sa-b" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {/* jets of inert gas converging on a freefall flame */}
      <g className="sa-jets">
        <path d="M30 60 C 110 70, 160 92, 214 104" />
        <path d="M24 110 C 100 110, 150 110, 208 110" />
        <path d="M30 160 C 110 150, 160 128, 214 116" />
      </g>
      <g className="sa-flame">
        <circle cx="262" cy="110" r="52" fill="#3a80ff" filter="url(#sa-b)" opacity="0.5" />
        <circle cx="262" cy="110" r="48" fill="url(#sa-f)" />
      </g>
    </svg>
  )
}
