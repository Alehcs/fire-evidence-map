# Fire Evidence Map

**The evidence map for fire safety in space.** A project for the 2026 NASA Space Apps Challenge,
[Flame in Freefall](https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/).

Live site: https://alehcs.github.io/fire-evidence-map/

NASA publishes its microgravity combustion experiments in the Physical Sciences Informatics (PSI) archive, one
table per investigation, each with its own units and layout. Fire Evidence Map merges the 24 Combustion Science
investigations into one comparable dataset, then answers a practical question: for the air of a given spacecraft,
Moon base or rover, what has actually been tested, and where would fire-safety design be extrapolating?

## What it shows

| View | Question it answers |
|---|---|
| Evidence Map | How close is the nearest real test to your cabin air, for solids, droplets, gas flames and smoke? |
| Flammability | When does it burn and when does it go out? Includes real BASS-II footage from the ISS. |
| Investigations | What did each of the 24 investigations burn, in what conditions, and how did its tests differ? |
| Compare | Can two investigations be compared, or did they burn different things? |
| Data | Where does every number come from? Downloads and the full method. |

## What we found

- **1,982 test records** unified from 22 experimental tables, plus day summaries covering 1,044 more flames.
- **No solid-material test above 22.2% oxygen** in the tables that state oxygen. The challenge statement expects
  30% or more for the Moon Base and pressurized rovers.
- **Droplets and gas flames were tested in that air**: FLEX ran droplets at 30% oxygen and about 71 kPa
  (10.3 psi), and ACME CFI-G ran gas flames at 30% and 55 kPa.
- **35 anomalies in the source data**, reported as found and never silently corrected: oxygen written as
  "3400%", species names produced by spreadsheet auto-increment ("CH5" to "CH14"), a pressure of 0 mmHg, and two
  sampled test videos that cannot be decoded.

## Data sources

All data comes from NASA PSI, released under CC0-1.0: https://psi.nasa.gov/physci/repo/ (Research Area:
Combustion Science). Investigations used: PSI-10, 20, 21, 22, 23, 25, 26, 39, 47, 60, 62, 68, 69, 98, 99, 100,
101, 102, 106, 107, 115, 117, 142 and 159. Each is cited by its DOI inside the site.

Background and the three "misconceptions" come from
[A Researcher's Guide to Combustion Science](https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/)
(NASA ISS Program Science Office). Video is from BASS-II (PSI-25), recompressed.

## How it works

```
pipeline/fetch_psi.py        download records and experimental tables from PSI
pipeline/build_dataset.py    unify 22 tables into one schema, keep every original row, write the quality report
pipeline/build_models.py     FLEX extinction model and CFI-G ignition counts, scored on held-out tests
pipeline/fetch_videos.py     download 14 BASS-II test videos
pipeline/process_videos.py   web clips, flame fingerprints and flame-size curves
pipeline/build_summaries.py  plain-language summaries, each quote checked against the PSI record
web/                         React + TypeScript site (Vite), static, no backend
```

Rules that are fixed and published on the Data page, with no model involved: unit conversion, distance to
evidence, the ranking score and the comparability verdict.

### Run it

```bash
python3 pipeline/fetch_psi.py && python3 pipeline/build_dataset.py && python3 pipeline/build_models.py
python3 pipeline/build_summaries.py
cd web && npm install && npm run data && npm run dev
```

Python needs `numpy`, `scikit-learn` and `opencv-python`; the video step also needs `ffmpeg`.

## Use of super intelligence (SI)

- **Machine learning.** A gradient-boosted tree model predicts the extinction diameter of FLEX fuel droplets
  (R² 0.78 with whole test days held out, mean absolute error 0.35 mm). Droplet size alone explains about half
  of that; the atmosphere and fuel explain the rest.
- **Language model.** The plain-language summaries of the 24 investigations were drafted by Claude (Anthropic)
  from PSI text only. A script keeps a supporting quote only if it appears verbatim in the PSI record.
- **Code.** The pipeline and the site were written with an AI coding assistant (Claude) and reviewed by the team.
- **Illustrations.** The flame on the home page is drawn by code and labelled as an illustration. No NASA
  imagery or branding is generated or modified.

## Limits

- Oxygen and pressure for tests run in cabin air are not in the tables. They are placed at 21% and 101.3 kPa,
  drawn hollow and never counted as recorded values.
- The BASS-II "Air display" column has no unit in the table; it is carried as an unverified reading.
- The FLEX model is fitted to NASA's summary table, not the raw data, and says nothing about solid materials.
- Video measurements are relative: there is no pixel scale, and the camera renders flames in pink.
- PSI holds no partial-gravity combustion data, so nothing here speaks to lunar or Martian gravity directly.

Not affiliated with or endorsed by NASA.
