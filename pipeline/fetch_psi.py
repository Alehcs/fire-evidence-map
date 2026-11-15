#!/usr/bin/env python3
"""Download the Combustion Science records and experimental tables from NASA PSI (CC0-1.0).

PSI (https://psi.nasa.gov/physci/repo/) serves its catalog through a public JSON interface. This script stores:
  data/raw/psi/catalog_all_133.json          the full investigation catalog
  data/raw/psi/investigations/PSI-<n>.json   one record per Combustion Science investigation
  data/raw/psi/experimental_tables/*.csv     the "Experimental Table" files

Disclosure: written with the assistance of an AI coding assistant (Claude).
"""
import json, os, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "psi")
BASE = "https://psi.nasa.gov/geode-py/ws"
UA = {"User-Agent": "Mozilla/5.0 (research-client)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()


def main():
    os.makedirs(os.path.join(RAW, "investigations"), exist_ok=True)
    os.makedirs(os.path.join(RAW, "experimental_tables"), exist_ok=True)
    catalog = json.loads(get(f"{BASE}/repo/search?size=500"))
    json.dump(catalog, open(os.path.join(RAW, "catalog_all_133.json"), "w"))
    accs = sorted((h["_source"]["Accession"] for h in catalog["hits"]["hits"]
                   if "combust" in (h["_source"].get("Research Area") or "").lower()), key=lambda a: int(a.split("-")[1]))
    for acc in accs:
        rec = json.loads(get(f"{BASE}/repo/investigations/{acc}"))
        json.dump(rec, open(os.path.join(RAW, "investigations", acc + ".json"), "w"))
        for t in rec.get("experimentalTable") or []:
            name = t["file_name"]
            # the download endpoint answers with a short-lived signed URL; it is used once and never stored
            signed = get(f"{BASE}/studies/{acc}/download?file={urllib.parse.quote(name)}&version={t.get('version', 1)}&redirect=false").decode().strip()
            open(os.path.join(RAW, "experimental_tables", name.replace("/", "_")), "wb").write(urllib.request.urlopen(signed, timeout=120).read())
            time.sleep(0.4)
        print(acc, len(rec.get("experimentalTable") or []), "table(s)")
        time.sleep(0.4)


if __name__ == "__main__":
    main()
