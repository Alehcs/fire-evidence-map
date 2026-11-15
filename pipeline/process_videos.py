#!/usr/bin/env python3
"""Turn the selected BASS-II test videos into web clips, flame-size curves and "flame fingerprints".

For each readable video in data/raw/psi/videos:
  * web clip  : 480 px wide H.264, 15 fps, no audio            -> web/public/media/<test>.mp4
  * poster    : the brightest frame                              -> web/public/media/<test>.jpg
  * fingerprint: one row per time step, each row = the brightest value in every image column.
                 A flame that moves along the sample draws a slanted streak.  -> web/public/media/<test>_fp.png
  * curve     : lit area (% of the frame) over time              -> data/processed/videos.json

Limits, stated in the UI as well: there is no pixel calibration, so sizes are relative; the camera renders
flames in pink, so colour is not analysed; the telemetry text burned into the top of each frame is masked out.

Disclosure: written with the assistance of an AI coding assistant (Claude).
"""
import json
import os
import subprocess

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "psi", "videos")
MEDIA = os.path.join(ROOT, "web", "public", "media")
OUT = os.path.join(ROOT, "data", "processed")
MASK_TOP = 120     # rows holding the burned-in telemetry text (of 480)
THRESH = 70        # brightness above which a pixel counts as flame
STEP = 3           # analyse every 3rd frame (about 10 per second)


def analyse(path):
    cap = cv2.VideoCapture(path)
    n, fps = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)), cap.get(cv2.CAP_PROP_FPS)
    w, h = int(cap.get(3)), int(cap.get(4))
    if not w or not n:
        return None
    t, area, cx, rows, edge = [], [], [], [], []
    best, best_frame = -1, None
    i = 0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        if i % STEP == 0:
            g = fr.max(axis=2)
            g[:MASK_TOP] = 0
            lit = g > THRESH
            a = float(lit.mean()) * 100.0
            t.append(i / fps)
            area.append(a)
            xs = np.nonzero(lit.any(axis=0))[0]
            cx.append(float(xs.mean()) / w if len(xs) else None)
            edge.append((float(xs.min()) / w, float(xs.max()) / w) if len(xs) else None)
            rows.append(cv2.resize(g.max(axis=0).reshape(1, -1), (360, 1), interpolation=cv2.INTER_AREA)[0])
            if a > best:
                best, best_frame = a, fr.copy()
        i += 1
    area = np.array(area)
    k = np.ones(5) / 5
    smooth = np.convolve(area, k, mode="same")
    on = np.nonzero(smooth > 0.02)[0]
    # Relative spread speed: straight-line fit to the flame's leading edge while it is well established.
    speed = None
    strong = [k for k in range(len(t)) if smooth[k] > 0.25 * smooth.max() and edge[k] is not None]
    if len(strong) > 30:
        tt = np.array([t[k] for k in strong])
        fits = []
        for side in (0, 1):
            xx = np.array([edge[k][side] for k in strong]) * 100.0
            slope, icpt = np.polyfit(tt, xx, 1)
            r2 = 1 - ((xx - (slope * tt + icpt)) ** 2).sum() / max(1e-9, ((xx - xx.mean()) ** 2).sum())
            fits.append((abs(slope), r2, slope))
        best_fit = max(fits, key=lambda f: f[0])  # the edge that actually travels is the leading one
        if best_fit[1] > 0.9 and best_fit[0] > 0.2:
            speed = dict(pct_width_per_s=round(float(best_fit[0]), 2), r2=round(float(best_fit[1]), 3), seconds=round(float(tt[-1] - tt[0]), 1))
    return dict(fps=fps, w=w, h=h, duration=n / fps, t=t, area=smooth, cx=cx, rows=np.array(rows, np.uint8), poster=best_frame,
                speed=speed, lit_seconds=float(len(on) * STEP / fps), first=float(t[on[0]]) if len(on) else None, last=float(t[on[-1]]) if len(on) else None,
                peak=float(smooth.max()))


def main():
    os.makedirs(MEDIA, exist_ok=True)
    index = json.load(open(os.path.join(SRC, "index.json")))
    tests = {t.get("test_label"): t for t in json.load(open(os.path.join(OUT, "tests.json")))["tests"] if t["accession"] == "PSI-25"}
    out, unreadable = [], []
    for item in index:
        test = item["test"]
        src = os.path.join(SRC, test + ".mp4")
        a = analyse(src)
        if a is None:
            unreadable.append(dict(test=test, source_file=item["source_file"]))
            print(f"{test:5} UNREADABLE ({item['source_file']})")
            continue
        rec = tests.get(test, {})
        # fingerprint: time runs downwards, at most 320 rows
        fp = a["rows"]
        fp = cv2.resize(fp, (360, min(320, len(fp))), interpolation=cv2.INTER_AREA)
        fp = cv2.applyColorMap(cv2.convertScaleAbs(fp, alpha=1.6), cv2.COLORMAP_INFERNO)
        cv2.imwrite(os.path.join(MEDIA, f"{test}_fp.png"), fp)
        poster = cv2.resize(a["poster"], (480, int(480 * a["h"] / a["w"])))
        cv2.imwrite(os.path.join(MEDIA, f"{test}.jpg"), poster, [cv2.IMWRITE_JPEG_QUALITY, 78])
        dst = os.path.join(MEDIA, f"{test}.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-an", "-vf", "scale=480:-2,fps=15", "-c:v", "libx264", "-crf", "30",
                        "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], check=True)
        # curve: about 4 points per second
        idx = np.linspace(0, len(a["t"]) - 1, min(len(a["t"]), int(a["duration"] * 4))).astype(int)
        out.append(dict(
            test=test, id=rec.get("id"), material=rec.get("fuel_original"), family=rec.get("fuel"),
            o2=(rec.get("o2_values") or [None])[0], o2_final=(rec.get("measures") or {}).get("o2_final_pct"),
            air_display=rec.get("flow_original"), source_file=item["source_file"],
            duration=round(a["duration"], 1), lit_seconds=round(a["lit_seconds"], 1), first=a["first"], last=a["last"], peak=round(a["peak"], 3),
            speed=a["speed"],
            curve=[[round(a["t"][i], 2), round(float(a["area"][i]), 4)] for i in idx],
            web_bytes=os.path.getsize(dst),
        ))
        print(f"{test:5} {rec.get('fuel_original', '')[:30]:30} O2={out[-1]['o2']} air={str(rec.get('flow_original'))[:14]:14} lit={out[-1]['lit_seconds']:5.1f}s speed={a['speed']}")
    json.dump(dict(note="Lit area is the share of the frame brighter than a fixed threshold. No pixel calibration: sizes are relative.",
                   mask_top_rows=MASK_TOP, threshold=THRESH, videos=out, unreadable=unreadable), open(os.path.join(OUT, "videos.json"), "w"))
    # record unreadable source files in the quality report (idempotent)
    qp = os.path.join(OUT, "quality_report.json")
    q = json.load(open(qp))
    q["findings"] = [f for f in q["findings"] if f["kind"] != "unreadable_video"]
    if unreadable:
        q["findings"].append(dict(accession="PSI-25", table="Raw Data (videos)", kind="unreadable_video", severity="warning", rows=[],
                                  detail=f"{len(unreadable)} of {len(index)} sampled test videos cannot be decoded (missing 'moov' atom): "
                                         + ", ".join(u["source_file"] for u in unreadable) + "."))
    json.dump(q, open(qp, "w"), ensure_ascii=False, indent=1)
    print("written", len(out), "videos;", len(unreadable), "unreadable; media MB", round(sum(os.path.getsize(os.path.join(MEDIA, f)) for f in os.listdir(MEDIA)) / 1e6, 1))


if __name__ == "__main__":
    main()
