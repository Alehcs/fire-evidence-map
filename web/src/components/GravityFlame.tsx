// Procedural flame that morphs between normal gravity (flickering teardrop) and freefall (dim blue sphere).
// It is an explanatory illustration drawn by code, not experimental footage.
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'

type RGB = [number, number, number]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: RGB, b: RGB, t: number) => `rgb(${Math.round(lerp(a[0], b[0], t))} ${Math.round(lerp(a[1], b[1], t))} ${Math.round(lerp(a[2], b[2], t))})`
const BLUE: RGB = [58, 128, 255]
const EMBER: RGB = [255, 112, 32]
const CX = 200
const R = 74
const BASE = 392

function geometry(g: number, time: number) {
  const breathe = 1 + 0.014 * Math.sin(1.3 * time) * (1 - g)
  const flick = 1 + g * (0.035 * Math.sin(7.3 * time) + 0.02 * Math.sin(13.1 * time + 1))
  return { H: 2 * R * (1 + 1.05 * g) * flick * breathe, W: R * (1 - 0.34 * g) * breathe, m: 1.75 * g, yb: BASE + (1 - g) * R * 0.5 }
}

// k scales the shape about its base, lift raises it: used for the bright inner core.
function flamePath(g: number, time: number, k = 1, lift = 0): string {
  const { H, W, m, yb } = geometry(g, time)
  const N = 72
  let d = ''
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const s = Math.sin(t / 2) // 0 at the tip, 1 at the base
    const top = 1 - s
    const sway = g * (10 * top * top * Math.sin(5.1 * time + 1.3) + 4 * top * top * top * Math.sin(11.7 * time))
    const x = (W * Math.sin(t) * Math.pow(s, m) + sway) * k
    const y = (-H * (1 + Math.cos(t))) / 2 * k - lift
    d += `${i ? 'L' : 'M'}${(CX + x).toFixed(1)} ${(yb + y).toFixed(1)}`
  }
  return d + 'Z'
}

export default function GravityFlame() {
  const state = useRef({ g: 1 })
  const tween = useRef<gsap.core.Tween | null>(null)
  const [g, setG] = useState(1)
  const glow = useRef<SVGPathElement>(null)
  const sphere = useRef<SVGPathElement>(null)
  const tear = useRef<SVGPathElement>(null)
  const core = useRef<SVGPathElement>(null)
  const halo = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const draw = (ms: number) => {
      const gg = state.current.g
      const time = still ? 0 : ms / 1000
      const d = flamePath(gg, time)
      glow.current?.setAttribute('d', d)
      glow.current?.setAttribute('fill', mix(BLUE, EMBER, gg))
      sphere.current?.setAttribute('d', d)
      sphere.current?.setAttribute('opacity', Math.pow(1 - gg, 1.4).toFixed(3))
      tear.current?.setAttribute('d', d)
      tear.current?.setAttribute('opacity', Math.pow(gg, 0.7).toFixed(3))
      core.current?.setAttribute('d', flamePath(gg, time, 0.5, 8))
      core.current?.setAttribute('opacity', (gg * 0.92).toFixed(3))
      const { H, yb } = geometry(gg, time)
      halo.current?.setAttribute('cy', (yb - H / 2).toFixed(1))
      halo.current?.setAttribute('fill', mix(BLUE, EMBER, gg))
      if (!still) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    if (still) {
      state.current.g = 0
      setG(0)
      requestAnimationFrame(draw)
    } else {
      // the flame "falls": gravity eases from 1 g to 0 g shortly after load
      tween.current = gsap.to(state.current, { g: 0, duration: 3.2, delay: 1.1, ease: 'power2.inOut', onUpdate: () => setG(state.current.g) })
    }
    return () => {
      cancelAnimationFrame(raf)
      tween.current?.kill()
    }
  }, [])

  const set = (v: number) => {
    tween.current?.kill()
    state.current.g = v
    setG(v)
  }

  return (
    <div className="stage">
      <svg viewBox="0 0 400 470" role="img" aria-label="A flame drawn as a flickering teardrop under Earth gravity that becomes a blue sphere in freefall">
        <defs>
          <radialGradient id="gf-sphere" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4a8dff" stopOpacity="0.1" />
            <stop offset="52%" stopColor="#4a92ff" stopOpacity="0.24" />
            <stop offset="80%" stopColor="#9cc9ff" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#3f7cff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="gf-tear" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#2f6bff" />
            <stop offset="16%" stopColor="#ffb54d" />
            <stop offset="55%" stopColor="#ffd98a" />
            <stop offset="100%" stopColor="#ff6a1f" />
          </linearGradient>
          <radialGradient id="gf-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="gf-halo-mask">
            <circle cx="200" cy="300" r="230" fill="url(#gf-halo)" />
          </mask>
          <filter id="gf-blur-l" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="24" />
          </filter>
          <filter id="gf-blur-s" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id="gf-blur-m" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <circle ref={halo} cx="200" cy="320" r="210" opacity="0.2" mask="url(#gf-halo-mask)" />
        <path ref={glow} filter="url(#gf-blur-l)" opacity="0.62" />
        <line x1="200" y1="386" x2="200" y2="452" stroke="#7d879b" strokeWidth="3" strokeLinecap="round" />
        <path ref={tear} fill="url(#gf-tear)" filter="url(#gf-blur-s)" />
        <path ref={core} fill="#fff4d2" filter="url(#gf-blur-m)" />
        <path ref={sphere} fill="url(#gf-sphere)" />
      </svg>
      <div className="gravity">
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((1 - g) * 100)}
          onChange={(e) => set(1 - +e.target.value / 100)}
          aria-label="Gravity, from Earth gravity to freefall"
        />
        <div className="ends">
          <span>Earth, 1 g</span>
          <span>Freefall, 0 g</span>
        </div>
      </div>
      <p className="stage-cap">
        {g > 0.5
          ? 'On Earth, hot gas rises and pulls fresh air in. The flame is a flickering teardrop.'
          : 'In freefall nothing rises. The flame becomes a dim blue sphere fed only by diffusion.'}
        <small>Drag to change gravity. Illustration drawn by AI-assisted code, not experimental footage.</small>
      </p>
    </div>
  )
}
