#!/usr/bin/env python3
"""Download a small, fixed selection of BASS-II (PSI-25) test videos from NASA PSI (CC0-1.0).

The selection spans materials and oxygen levels. Videos are raw source data and are not committed.
Disclosure: written with the assistance of an AI coding assistant (Claude).
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "raw", "psi", "videos")
UA = {"User-Agent": "Mozilla/5.0 (research-client)"}
SELECTION = ["T12", "T22", "T4", "T25", "T28b", "B14", "B20", "B19", "B9", "B1", "B2", "F1", "P12", "T7"]


def tree():
    req = urllib.request.Request("https://psi.nasa.gov/geode-py/ws/files/v2", headers={**UA, "Content-Type": "application/json"},
                                 data=json.dumps({"folder": "", "fileType": "study", "studyId": "PSI-25", "version": "4"}).encode())
    d = json.load(urllib.request.urlopen(req, timeout=120))
    out = []
    def walk(n):
        for f in n.get("files", []):
            walk(f) if f.get("files") else out.append(f)
    for t in d["files"]:
        walk(t)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    files = [f for f in tree() if f["key"].lower().endswith(".mp4") and "Still" not in f["key"] and "2ND" not in f["key"]]
    index = []
    for test in SELECTION:
        cands = [f for f in files if re.search(rf"TEST_?{re.escape(test)}(?![0-9a-z])", f["key"])]
        if not cands:
            print(test, "NOT FOUND"); continue
        f = min(cands, key=lambda x: x["bytes_size"])
        name = f["key"].split("/")[-1]
        dst = os.path.join(OUT, f"{test}.mp4")
        if not (os.path.exists(dst) and os.path.getsize(dst) == f["bytes_size"]):
            u = "https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?file=%s&version=%s&redirect=false" % (urllib.parse.quote(name), f.get("version", 1))
            signed = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=120).read().decode().strip()
            if not signed.startswith("http"):
                print(test, "no signed url:", signed[:120]); continue
            data = urllib.request.urlopen(signed, timeout=600).read()
            open(dst, "wb").write(data)
            time.sleep(0.5)
        ok = os.path.getsize(dst) == f["bytes_size"]
        print(f"{test:5} {os.path.getsize(dst)/1e6:6.1f} MB  size-match={ok}  {name}")
        index.append(dict(test=test, source_file=name, bytes=f["bytes_size"], psi_key=f["key"]))
    json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
