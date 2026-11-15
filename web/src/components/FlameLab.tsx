// Real BASS-II footage from the ISS, tied to the test it belongs to.
// The fingerprint and the curve are computed by pipeline/process_videos.py from the video pixels.
import { useMemo, useRef, useState } from 'react'
import { fmt, type Dataset, type VideoRec } from '../data'

const media = (f: string) => `${import.meta.env.BASE_URL}media/${f}`
const TRIO = ['B1', 'B9', 'B19']

function Curve({ v, t }: { v: VideoRec; t: number }) {
  const W = 480
  const H = 120
  const max = Math.max(...v.curve.map((c) => c[1]), 0.01)
  const sx = (x: number) => (x / v.duration) * W
  const sy = (y: number) => H - 4 - (y / max) * (H - 12)
  const d = v.curve.map((c, i) => `${i ? 'L' : 'M'}${sx(c[0]).toFixed(1)} ${sy(c[1]).toFixed(1)}`).join('')
  return (
    <svg className="plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Flame size over ${fmt(v.duration, 0)} seconds for test ${v.test}`}>
      <line className="axis" x1={0} x2={W} y1={H - 4} y2={H - 4} />
      <path className="line s2" d={d} />
      <line className="rule" x1={sx(t)} x2={sx(t)} y1={0} y2={H - 4} />
    </svg>
  )
}

const short = (v: VideoRec) => {
  const f = (v.family ?? '').toLowerCase()
  return f.includes('sibal') ? 'Fabric' : f.includes('pmma') ? 'Plastic' : f.includes('nomex') ? 'Nomex' : f.includes('sphere') ? 'Sphere' : f.includes('film') ? 'Film' : 'Sample'
}

export default function FlameLab({ data, sel, onSel }: { data: Dataset; sel: string; onSel: (t: string) => void }) {
  const vids = useMemo(() => (data.videos?.videos ?? []).filter((v) => v.lit_seconds >= 3).sort((a, b) => (b.o2 ?? 0) - (a.o2 ?? 0)), [data])
  const [t, setT] = useState(0)
  const trioRefs = useRef<(HTMLVideoElement | null)[]>([])
  if (!vids.length) return null
  const v = vids.find((x) => x.test === sel) ?? vids[0]
  const trio = TRIO.map((id) => vids.find((x) => x.test === id)).filter(Boolean) as VideoRec[]
  const bad = data.videos?.unreadable ?? []
  const playAll = () =>
    trioRefs.current.forEach((el) => {
      if (!el) return
      el.currentTime = 0
      void el.play()
    })

  return (
    <div className="card anchor" id="sec-flames">
      <h2>Watch the real flames</h2>
      <p className="note">Footage from the BASS-II tests on the ISS. Each clip is tied to its row in NASA’s table.</p>

      {trio.length === 3 && (
        <>
          <div className="chart-head">
            <h3>Same plastic film, three oxygen levels</h3>
            <button className="ghost" style={{ marginTop: 0 }} onClick={playAll}>
              Play all three
            </button>
          </div>
          <div className="grid-3 flame-trio">
            {trio.map((x, i) => (
              <figure key={x.test}>
                <video ref={(el) => void (trioRefs.current[i] = el)} src={media(`${x.test}.mp4`)} poster={media(`${x.test}.jpg`)} muted playsInline controls preload="none" />
                <figcaption>
                  <b>{fmt(x.o2)}% oxygen</b>
                  <span className="dim">
                    Air display {x.air_display} · flame visible {fmt(x.lit_seconds, 0)} s
                    {x.speed ? ` · spread ${fmt(x.speed.pct_width_per_s, 2)}% of frame width per second` : ''}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="foot">Oxygen and air speed both differ between these tests, so the difference is not due to oxygen alone.</p>
        </>
      )}

      <h3 style={{ marginTop: 22 }}>Every clip, with its flame fingerprint</h3>
      <div className="chips" style={{ margin: '10px 0 14px' }}>
        {vids.map((x) => (
          <button key={x.test} className={`chip ${x.test === v.test ? 'on' : ''}`} onClick={() => (onSel(x.test), setT(0))} title={`Test ${x.test}: ${x.material}`}>
            {short(x)} · {fmt(x.o2)}% oxygen
          </button>
        ))}
      </div>
      <div className="grid-2">
        <figure>
          <video key={v.test} src={media(`${v.test}.mp4`)} poster={media(`${v.test}.jpg`)} muted playsInline controls preload="none" onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} />
          <figcaption>
            <b>
              Test {v.test}: {v.material}
            </b>
            <span className="dim">
              {fmt(v.o2)}% oxygen at start{v.o2_final != null ? `, ${fmt(v.o2_final)}% at end` : ''} · air display {v.air_display || 'not stated'}
            </span>
          </figcaption>
        </figure>
        <div>
          <div className="fp">
            <img src={media(`${v.test}_fp.png`)} alt={`Flame fingerprint of test ${v.test}`} loading="lazy" />
            <i style={{ top: `${Math.min(100, (t / v.duration) * 100)}%` }} />
            <span className="fp-x">position along the sample →</span>
            <span className="fp-y">time ↓</span>
          </div>
          <p className="foot">
            Flame fingerprint. A slanted streak is a flame moving along the sample. The white line follows the video.
          </p>
          <Curve v={v} t={t} />
          <p className="foot">Flame size over time (share of the frame that is lit). Relative only: the video has no pixel scale.</p>
        </div>
      </div>
      <p className="foot">
        Video: NASA PSI, BASS-II (PSI-25), CC0-1.0, recompressed. The camera shows flames in pink; colour is not analysed. Fingerprints and
        curves are derived by our code.{bad.length ? ` ${bad.length} of the 14 sampled source videos could not be decoded (${bad.map((b) => b.test).join(', ')}).` : ''}
      </p>
    </div>
  )
}
