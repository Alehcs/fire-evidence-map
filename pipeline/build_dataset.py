#!/usr/bin/env python3
"""Build the unified NASA PSI combustion test dataset.

Input : data/raw/psi/  (investigation records + "Experimental Table" CSVs downloaded from
        https://psi.nasa.gov/physci/repo/ , Research Area = Combustion Science)
Output: data/processed/tests.json, tests.csv, investigations.json, quality_report.json

Design rules
  * Never overwrite a source value: every record keeps the original row (`original`).
  * Every normalised condition carries a `*_basis` flag saying where it came from.
  * Nothing is silently corrected. Suspected source anomalies go to quality_report.json.

Disclosure: this code was written with the assistance of an AI coding assistant (Claude).
"""
import collections
import csv
import datetime
import io
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "psi")
OUT = os.path.join(ROOT, "data", "processed")
MMHG, ATM, BAR = 0.133322, 101.325, 100.0
CABIN_KPA, CABIN_O2 = 101.3, 21.0

# Basis vocabulary -----------------------------------------------------------------------
RECORDED = "recorded"          # numeric value given per row in the PSI table
NOMINAL = "nominal"            # approximate / nominal value stated in the table (e.g. "~21%", "1 atm")
LISTED = "listed_set"          # table lists several values or a range for the row
ASSUMED = "assumed_cabin"      # NOT in the table: nominal ISS/Cygnus cabin air assumed (flagged)
UNVERIFIED = "display_reading" # instrument display reading, unit not stated in the table
MISSING = "not_in_table"

NUM = re.compile(r"(?<![\w.])[-+]?(?:\d+\.\d*|\.\d+|\d+)")


def nums(s):
    return [float(x) for x in NUM.findall(s or "")]


def num(s):
    v = nums(s)
    return v[0] if v else None


def read_table(path):
    raw = open(path, "rb").read()
    try:
        text, enc = raw.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        text, enc = raw.decode("cp1252"), "cp1252"
    rows = list(csv.reader(io.StringIO(text)))
    header = [c.strip() for c in rows[0]]
    body = []
    for i, r in enumerate(rows[1:], start=2):  # i = 1-based row number in the CSV (header = 1)
        cells = [c.strip() for c in r] + [""] * (len(header) - len(r))
        if any(cells):
            body.append((i, cells))
    return header, body, enc


# Curated investigation metadata -----------------------------------------------------------
# pillar / tier follow the wording of the challenge statement:
#   tier 1 = named as a core fire-safety study (prevention / detection / suppression paragraphs)
#   tier 2 = named for a specific fire-safety link under "Potential Considerations"
#   tier 3 = "other combustion investigations ... still relevant, just not as strongly or directly"
META = {
    "PSI-10": dict(short="ACME Flame Design", phase="gas", facility="CIR / ACME", pillars=["foundational"], tier=3),
    "PSI-20": dict(short="ACME BRE", phase="gas", facility="CIR / ACME", pillars=["prevention"], tier=2,
                   tier_reason="Challenge: BRE 'was a study of materials flammability in still atmospheres' (gaseous fuel emulating solids/liquids)."),
    "PSI-21": dict(short="ACME CLD Flame", phase="gas", facility="CIR / ACME", pillars=["foundational"], tier=3),
    "PSI-22": dict(short="ACME E-FIELD Flames", phase="gas", facility="CIR / ACME", pillars=["foundational"], tier=2,
                   tier_reason="Challenge: partial gravity 'was mimicked' through the electric field effect on flame ions."),
    "PSI-23": dict(short="ACME s-Flame", phase="gas", facility="CIR / ACME", pillars=["foundational"], tier=3),
    "PSI-25": dict(short="BASS-II", phase="solid", facility="MSG (SPICE flow duct)", pillars=["prevention"], tier=1,
                   tier_reason="Challenge: flammability of solid materials 'as studied in BASS and BASS-II'."),
    "PSI-26": dict(short="BASS", phase="solid", facility="MSG (SPICE flow duct)", pillars=["prevention", "suppression"], tier=1,
                   tier_reason="Challenge: flammability of solid materials 'as studied in BASS and BASS-II'; PSI objective 2 assesses a gaseous extinguishing agent."),
    "PSI-39": dict(short="CFI", phase="droplet", facility="CIR / MDCA", pillars=["foundational"], tier=3),
    "PSI-47": dict(short="DAFT / DAFT-2", phase="aerosol", facility="ISS cabin (hand-held instruments)", pillars=["detection"], tier=2,
                   tier_reason="Challenge: a SAME smoke-detection instrument 'was instead used to detect dust' in DAFT."),
    "PSI-60": dict(short="SPICE data analysis (ground)", phase="gas", facility="Ground analysis", pillars=["foundational"], tier=3),
    "PSI-62": dict(short="Concurrent flame spread modeling (ground)", phase="solid", facility="Ground analysis", pillars=["prevention"], tier=3),
    "PSI-68": dict(short="FLEX-2", phase="droplet", facility="CIR / MDCA", pillars=["foundational"], tier=3),
    "PSI-69": dict(short="FLEX", phase="droplet", facility="CIR / MDCA", pillars=["suppression"], tier=1,
                   tier_reason="Challenge: 'Suppression was studied in FLEX through dilution ... with carbon dioxide and helium'."),
    "PSI-98": dict(short="Saffire-I", phase="solid", facility="Cygnus (Saffire enclosure)", pillars=["prevention"], tier=1,
                   tier_reason="Challenge: flammability of solid materials studied in Saffire-I, -II and -III."),
    "PSI-99": dict(short="Saffire-II", phase="solid", facility="Cygnus (Saffire enclosure)", pillars=["prevention"], tier=1,
                   tier_reason="Challenge: flammability of solid materials studied in Saffire-I, -II and -III."),
    "PSI-100": dict(short="Saffire-III", phase="solid", facility="Cygnus (Saffire enclosure)", pillars=["prevention"], tier=1,
                    tier_reason="Challenge: flammability of solid materials studied in Saffire-I, -II and -III."),
    "PSI-101": dict(short="SAME-R", phase="smoke", facility="MSG", pillars=["detection"], tier=1,
                    tier_reason="Challenge: 'Fire detection was tested in microgravity through SAME and SAME-R'."),
    "PSI-102": dict(short="SAME", phase="smoke", facility="MSG", pillars=["detection"], tier=1,
                    tier_reason="Challenge: 'Fire detection was tested in microgravity through SAME and SAME-R'."),
    "PSI-106": dict(short="SLICE", phase="gas", facility="MSG (SPICE flow duct)", pillars=["foundational"], tier=3),
    "PSI-107": dict(short="SPICE", phase="gas", facility="MSG (SPICE flow duct)", pillars=["foundational"], tier=3),
    "PSI-115": dict(short="SAME data modeling (ground)", phase="smoke", facility="Ground analysis", pillars=["detection"], tier=3),
    "PSI-117": dict(short="Cool flame CFD (ground)", phase="droplet", facility="Ground analysis", pillars=["foundational"], tier=3),
    "PSI-142": dict(short="Cool flame transitions (ground)", phase="gas", facility="Ground laboratory", pillars=["foundational"], tier=3),
    "PSI-159": dict(short="ACME CFI-G", phase="gas", facility="CIR / ACME", pillars=["foundational"], tier=2,
                    tier_reason="Challenge: 'Microgravity tests with the highest oxygen concentrations were conducted as part of CFI-G' (up to 85% O2)."),
}

# Facility-level diagnostics, from the appendix of "A Researcher's Guide to: Combustion Science"
# (NASA ISS Program Science Office, NP-2015-10-034-JSC). ACME list was "planned" at the time.
DIAGNOSTICS = {
    "CIR / MDCA": ["analog color camera", "radiometer", "low-light-level UV camera", "two HiBMs cameras"],
    "CIR / ACME": ["radiometers", "two color cameras", "low-light-level UV camera", "two HiBMs cameras",
                   "photomultiplier tubes", "ion current measurement", "gas chromatograph"],
    "MSG (SPICE flow duct)": ["digital still camera", "video camera", "air flow", "fuel flow", "radiometer"],
    "MSG": ["digital still camera", "video camera", "air flow", "fuel flow", "radiometer"],
}

records = []
quality = []


def q(acc, table, kind, detail, rows=None, severity="note"):
    quality.append(dict(accession=acc, table=table, kind=kind, detail=detail, rows=rows or [], severity=severity))


def add(acc, table, tkey, line, header, cells, granularity, **kw):
    original = {h: c for h, c in zip(header, cells) if c}
    r = dict(
        id=f"{acc}/{tkey}/r{line}", accession=acc, investigation=META[acc]["short"], table=table, csv_row=line,
        granularity=granularity, fuel_phase=META[acc]["phase"], facility=META[acc]["facility"],
        pillars=META[acc]["pillars"], tier=META[acc]["tier"],
        fuel=None, fuel_original=None, geometry=None, n_flames=None,
        o2_values=[], o2_basis=MISSING, o2_role=None, o2_original=None,
        pressure_values_kpa=[], pressure_basis=MISSING, pressure_original=None,
        flow_values_cm_s=[], flow_basis=MISSING, flow_original=None, flow_direction=None,
        diluents=None, outcome=None, outcome_original=None, measures={}, notes=[], original=original,
    )
    r.update(kw)
    r["o2_values"] = [round(v, 3) for v in r["o2_values"]]
    r["pressure_values_kpa"] = [round(v, 2) for v in r["pressure_values_kpa"]]
    r["flow_values_cm_s"] = [round(v, 3) for v in r["flow_values_cm_s"]]
    records.append(r)
    return r


def tpath(name):
    return os.path.join(RAW, "experimental_tables", name)


def clean(d):
    return {k: v for k, v in d.items() if v is not None and v != ""}


# ------------------------------------------------------------------------------------------
# Droplets (CIR / MDCA)
# ------------------------------------------------------------------------------------------
def flex():
    acc, name = "PSI-69", "PSI-69_Experimental table_FLEX.csv"
    h, body, _ = read_table(tpath(name))
    endmap = {"Extinction": "extinction", "Disruption": "disruption", "Completion": "burned_to_completion"}
    for line, c in body:
        o2, n2, co2, he, p = num(c[6]), num(c[7]), num(c[8]), num(c[9]), num(c[5])
        notes = []
        pk = []
        if p is None or p <= 0:
            notes.append("Ambient pressure recorded as 0 mmHg in the source table; treated as missing.")
            q(acc, name, "implausible_value", "Ambient pressure recorded as 0 mmHg.", [line], "warning")
        else:
            pk = [p * MMHG]
        add(acc, name, "main", line, h, c, "test",
            fuel=c[4], fuel_original=c[4],
            geometry=(f"droplet, initial diameter {c[10]} mm" if num(c[10]) is not None else "droplet"),
            o2_values=[o2 * 100] if o2 is not None else [], o2_basis=RECORDED, o2_role="ambient", o2_original=c[6],
            pressure_values_kpa=pk, pressure_basis=RECORDED if pk else MISSING, pressure_original=c[5] + " mmHg",
            diluents=clean({"N2": n2, "CO2": co2, "He": he}),
            outcome=endmap.get(c[14]), outcome_original=c[14],
            measures=clean({"initial_diameter_mm": num(c[10]), "extinction_diameter_mm": num(c[11]),
                            "burning_rate": num(c[12]), "burn_time_s": num(c[13])}),
            test_label=c[1], notes=notes)
    q(acc, name, "header_truncated",
      "Column headers lost subscripts: 'O initial', 'N initial', 'CO initial' denote O2, N2 and CO2 mole fractions; "
      "'Burning rate; mm' lost its unit (mm^2/s).", [1])


def flex2():
    acc, name = "PSI-68", "PSI-68_Experimental table_Flex2.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        add(acc, name, "main", line, h, c, "matrix",
            fuel=c[0], fuel_original=c[0], geometry=f"droplet, initial diameter {c[1]} mm",
            o2_values=[v * 100 for v in nums(c[3])], o2_basis=LISTED, o2_role="ambient", o2_original=c[3],
            pressure_values_kpa=[v * ATM for v in nums(c[4])], pressure_basis=LISTED, pressure_original=c[4] + " atm",
            flow_values_cm_s=nums(c[6]), flow_basis=LISTED, flow_original=c[6] + " cm/s",
            notes=["Row is a test-matrix summary (ranges/sets), not an individual test."])


def cfi():
    acc, name = "PSI-39", "PSI-39_Experimental table_CFI.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        o2, p = num(c[5]), num(c[4])
        add(acc, name, "main", line, h, c, "test",
            fuel=c[9], fuel_original=c[9], geometry="droplet" + (", fiber supported" if c[8] == "Yes" else ", free" if c[8] == "No" else ""),
            o2_values=[o2 * 100] if o2 is not None else [], o2_basis=RECORDED, o2_role="ambient", o2_original=c[5],
            pressure_values_kpa=[p * ATM] if p else [], pressure_basis=NOMINAL, pressure_original=c[4],
            diluents=clean({"N2": num(c[6]), "He": num(c[7])}), test_label=c[0])


# ------------------------------------------------------------------------------------------
# Solids (MSG flow duct, Saffire)
# ------------------------------------------------------------------------------------------
def solid_family(s):
    t = s.lower()
    if "sibal" in t:
        return "SIBAL fabric (cotton-fiberglass)"
    if "nomex" in t and "pmma" in t:
        return "PMMA & Nomex"
    if "nomex" in t:
        return "Nomex"
    if "pmma" in t or "acrylic" in t:
        return "PMMA"
    if "candle" in t or "wax" in t:
        return "Wax candle"
    if "silicone" in t:
        return "Silicone"
    if "rod" in t:
        return "Rod (material as written in source)"
    if "sphere" in t or "spherical" in t:
        return "Sphere (material as written in source)"
    if "film" in t or "micron" in t:
        return "Film (material as written in source)"
    return s


def bass2():
    acc, name = "PSI-25", "PSI-25_Experimental table_BASS-II.csv"
    h, body, _ = read_table(tpath(name))
    neg = []
    for line, c in body:
        o2i, o2f = num(c[11]), num(c[12])
        flow = [v for v in nums(c[8].replace("<", "")) if 0 <= v <= 60]
        notes = []
        if re.search(r"ext|blowoff|blow off", c[8], re.I):
            notes.append("Air display note mentions extinction/blowoff during flow changes.")
        add(acc, name, "main", line, h, c, "test",
            fuel=solid_family(c[5]), fuel_original=c[5], geometry=c[5],
            o2_values=[o2i] if o2i is not None else [], o2_basis=RECORDED, o2_role="ambient", o2_original=c[11],
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            flow_values_cm_s=flow, flow_basis=UNVERIFIED if flow else MISSING, flow_original=c[8],
            measures=clean({"o2_final_pct": o2f, "co2_initial_pct": num(c[13]), "co2_final_pct": num(c[14]),
                            "co_initial_ppm": num(c[15]), "co_final_ppm": num(c[16])}),
            test_label=c[1], sample_label=c[4], pi=c[0], notes=notes)
        if num(c[15]) is not None and num(c[15]) < 0:
            neg.append(line)
    if neg:
        q(acc, name, "implausible_value",
          f"Initial CO recorded as a negative value (-1 to -3 ppm) in {len(neg)} rows; likely sensor zero offset.", neg)
    q(acc, name, "unit_not_stated",
      "'Air display' and 'Fan display' are instrument readings without a unit in the table. We carry 'Air display' "
      "as an air-speed reading (cm/s presumed) flagged as unverified; many cells hold a sequence of settings.", [1], "warning")


def bass():
    acc, name = "PSI-26", "PSI-26_Experimental table_BASS.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        add(acc, name, "main", line, h, c, "test",
            fuel=solid_family(c[5]), fuel_original=c[5], geometry=c[5],
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            test_label=c[3], sample_label=c[4],
            notes=["Oxygen and air flow are not in this table. The Researcher's Guide reports BASS ran in ISS air "
                   "(nominally 21% O2) and, with nitrogen, as low as 17% O2."])
    q(acc, name, "missing_conditions",
      "The BASS experimental table lists only date, test, sample and material: oxygen concentration and air flow "
      "per test are not provided.", [1], "warning")


def saffire(acc, name, layout):
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        label = c[0]
        if label.lower().startswith("note") or c[1].lower().startswith("pre-test"):
            q(acc, name, "non_test_row", f"Row is not a test ({(label + ' ' + c[1])[:70].strip()}...).", [line])
            continue
        mat = c[1]
        notes = []
        if not mat:
            notes.append("Material cell is empty in the source row.")
            q(acc, name, "empty_cell", f"Sample {label}: material cell is empty.", [line], "warning")
        o2 = nums(c[layout["o2"]]) if "o2" in layout else []
        flow = nums(c[layout["flow"]])
        measures = {}
        if "burn" in layout:
            measures["burn_time_s"] = num(c[layout["burn"]])
            measures["ignition_power_w"] = num(c[layout["ignp"]])
        if "ug_len" in layout:
            measures.update({"microgravity_burn_length": c[layout["ug_len"]], "microgravity_spread": c[layout["ug_len"] + 1],
                             "normal_gravity_burn_length": c[layout["ug_len"] + 2], "normal_gravity_spread_rate": c[layout["ug_len"] + 3]})
        thick = c[2]
        if re.fullmatch(r"0\d+ mm", thick):
            q(acc, name, "suspected_typo", f"Sample {label}: thickness written as '{thick}' (decimal point likely missing).", [line], "warning")
        add(acc, name, "main", line, h, c, "test",
            fuel=solid_family(mat) if mat else None, fuel_original=mat or None,
            geometry=f"sheet, thickness {thick}, length {c[3]}, width {c[4]}",
            o2_values=o2, o2_basis=(NOMINAL if o2 else MISSING), o2_role="ambient" if o2 else None,
            o2_original=c[layout["o2"]] if "o2" in layout else None,
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            flow_values_cm_s=flow[:1], flow_basis=RECORDED if flow else MISSING, flow_original=c[layout["flow"]],
            flow_direction=c[layout["dir"]].lower() or None,
            measures=clean(measures), test_label=label, notes=notes)


# ------------------------------------------------------------------------------------------
# Smoke / aerosol (detection)
# ------------------------------------------------------------------------------------------
def same_r():
    acc, name = "PSI-101", "PSI-101_Experimental table_SAME-R.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        v = num(c[4])
        add(acc, name, "main", line, h, c, "test",
            fuel=c[0], fuel_original=c[0], geometry="overheated material sample (smoke source)",
            o2_values=[CABIN_O2], o2_basis=ASSUMED, o2_role="ambient",
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            flow_values_cm_s=[v] if v is not None else [], flow_basis=RECORDED if v is not None else MISSING, flow_original=c[4],
            measures=clean({"rt_over_r0": num(c[5]), "duration_s": num(c[6]), "net_aging_time_s": num(c[9])}),
            test_label=c[1], description=c[2])


def same():
    acc, name = "PSI-102", "PSI-102_Experimental table_SAME.csv"
    h, body, _ = read_table(tpath(name))
    base_flows = sorted({num(c[2]) for _, c in body if num(c[2]) is not None})
    for line, c in body:
        v = num(c[2])
        ref = "same conditions" in c[1].lower()
        add(acc, name, "main", line, h, c, "matrix" if ref else "test",
            fuel=c[1].split(":")[0], fuel_original=c[1], geometry="overheated material sample (smoke source)",
            o2_values=[CABIN_O2], o2_basis=ASSUMED, o2_role="ambient",
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            flow_values_cm_s=base_flows if ref else ([v] if v is not None else []),
            flow_basis=LISTED if ref else RECORDED, flow_original=c[2] or "same conditions as samples 1-4",
            measures=clean({"weight_loss_rate_mg_min": num(c[3]), "aging_duration_min": num(c[4])}),
            notes=["Row refers to the conditions of samples 1-4 instead of listing them."] if ref else [])


def daft():
    acc, name = "PSI-47", "PSI-47_Experimental table_DAFT.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        add(acc, name, "main", line, h, c, "session", fuel="Arizona Road Dust (test aerosol)", fuel_original=c[3],
            geometry=c[2], o2_values=[CABIN_O2], o2_basis=ASSUMED, o2_role="ambient",
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED, test_label=c[0],
            notes=["Instrument feasibility session (dust/aerosol sampling), not a combustion test."])


# ------------------------------------------------------------------------------------------
# Gaseous flames
# ------------------------------------------------------------------------------------------
def spice():
    acc, name = "PSI-107", "PSI-107_Experimental table_Spice.csv"
    h, body, _ = read_table(tpath(name))
    seen = collections.defaultdict(list)
    for line, c in body:
        seen[tuple(c)].append(line)
        v = num(c[8])
        add(acc, name, "main", line, h, c, "test",
            fuel=c[3].replace("%", "% ").replace("  ", " ").strip(), fuel_original=c[3],
            geometry=f"gas-jet burner, nozzle {c[4]} mm, coflow duct",
            o2_values=[CABIN_O2], o2_basis=ASSUMED, o2_role="ambient (coflow air)",
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            flow_values_cm_s=[v] if v is not None else [], flow_basis=RECORDED if v is not None else MISSING, flow_original=c[8],
            measures=clean({"fuel_rate_sccm": num(c[5]), "fuel_rate_mg_s": num(c[6]), "hc_fuel_rate_mg_s": num(c[7])}))
    negf = [l for l, c in body if num(c[8]) is not None and num(c[8]) < 0]
    if negf:
        q(acc, name, "implausible_value", f"Air rate (cm/s) is negative in {len(negf)} row(s).", negf, "warning")
    dups = [v for v in seen.values() if len(v) > 1]
    if dups:
        q(acc, name, "duplicate_rows", f"{len(dups)} group(s) of fully identical rows.", [x for g in dups for x in g][:20])
    if any("." in c[1] and ":" not in c[1] for _, c in body):
        q(acc, name, "inconsistent_format", "Ignition times use two formats (hh:mm:ss and hh.mm.ss).",
          [l for l, c in body if "." in c[1] and ":" not in c[1]][:20])


def slice_():
    acc, name = "PSI-106", "PSI-106_Experimental table_Slice.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        add(acc, name, "main", line, h, c, "test_day", fuel=c[1].split("(")[0].strip(), fuel_original=c[1],
            geometry="gas-jet burner, coflow duct", o2_values=[CABIN_O2], o2_basis=ASSUMED, o2_role="ambient (coflow air)",
            pressure_values_kpa=[CABIN_KPA], pressure_basis=ASSUMED,
            notes=["Row summarises one test day; individual flames are not listed."])


def flame_design():
    acc = "PSI-10"
    name = "PSI-10_Experimental table_Flame Design_Inverse Flame.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        o2, p = num(c[3]), num(c[9])
        notes = [] if o2 is not None else [f"O2 mole fraction not numeric in source ('{c[3]}')."]
        add(acc, name, "inverse", line, h, c, "test", fuel="C2H4 (ethylene)", fuel_original="XC2H4 columns",
            geometry="spherical porous burner, inverse flame (oxidizer issues from burner)",
            o2_values=[o2 * 100] if o2 is not None else [], o2_basis=RECORDED if o2 is not None else MISSING,
            o2_role="oxidizer stream from burner (inverse flame)", o2_original=c[3],
            pressure_values_kpa=[p * ATM] if p else [], pressure_basis=RECORDED if p else MISSING, pressure_original=c[9] + " atm",
            measures=clean({"fuel_mole_fraction_chamber": num(c[7]), "adiabatic_flame_temp_k": num(c[13]), "p_mean_atm": num(c[11])}),
            test_label=c[2], notes=notes)
    name = "PSI-10_Experimental table_Flame Design_Normal Flame.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        o2, p = num(c[8]), num(c[10])
        add(acc, name, "normal", line, h, c, "test", fuel=c[2], fuel_original=c[2],
            geometry="spherical porous burner, normal flame (fuel issues from burner)",
            o2_values=[o2 * 100] if o2 is not None else [], o2_basis=RECORDED if o2 is not None else MISSING,
            o2_role="ambient", o2_original=c[8],
            pressure_values_kpa=[p * ATM] if p else [], pressure_basis=RECORDED if p else MISSING, pressure_original=c[10] + " atm",
            measures=clean({"fuel_mole_fraction_burner": num(c[4]), "o2_final_pct": (num(c[9]) or 0) * 100 or None,
                            "adiabatic_flame_temp_k": num(c[14]), "p_mean_atm": num(c[12])}),
            test_label=c[3])


def cfig():
    acc = "PSI-159"
    ign = {"yes": "hot_ignition", "no": "no_hot_ignition", "flash": "flash"}
    end = {"SE": "self_extinguished", "FT": "flow_terminated"}
    name = "PSI-159_Experimental table_CFI-G_Inverse Flames.csv"
    h, body, _ = read_table(tpath(name))
    cases = collections.Counter()
    for line, c in body:
        o2, p = num(c[7]), num(c[6])
        cases[c[13]] += 1
        add(acc, name, "inverse", line, h, c, "test", fuel=c[2].lower(), fuel_original=c[2],
            geometry="spherical porous burner, inverse flame (oxidizer issues from burner into fuel/N2 atmosphere)",
            o2_values=[o2 * 100] if o2 is not None else [], o2_basis=RECORDED, o2_role="oxidizer stream from burner (inverse flame)", o2_original=c[7],
            pressure_values_kpa=[p * BAR] if p else [], pressure_basis=NOMINAL, pressure_original=c[6] + " bar",
            outcome=ign.get(c[13].lower()), outcome_original=c[13],
            measures=clean({"burn_time_s": num(c[14]), "end_mode": end.get(c[15]), "fuel_mole_fraction_chamber": num(c[4]),
                            "adiabatic_flame_temp_k": num(c[11]), "flame_color": c[18] if c[18] not in ("", "-") else None,
                            "comment": c[19] or None}),
            test_label=c[3])
    if len({k.lower() for k in cases}) < len(cases):
        q(acc, name, "inconsistent_case", f"Categorical values differ only by letter case: {dict(cases)}.")
    name = "PSI-159_Experimental table_CFI-G_Normal Flames.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        o2, p = num(c[5]), num(c[7])
        add(acc, name, "normal", line, h, c, "test", fuel=c[2].lower(), fuel_original=c[2],
            geometry="spherical porous burner, normal flame (fuel issues from burner)",
            o2_values=[o2 * 100] if o2 is not None else [], o2_basis=RECORDED, o2_role="ambient", o2_original=c[5],
            pressure_values_kpa=[p * BAR] if p else [], pressure_basis=NOMINAL, pressure_original=c[7] + " bar",
            outcome=ign.get(c[13].lower()), outcome_original=c[13],
            measures=clean({"burn_time_s": num(c[14]), "end_mode": end.get(c[15]), "cool_flame_note": c[4] or None,
                            "fuel_mole_fraction_burner": num(c[8]), "adiabatic_flame_temp_k": num(c[11]),
                            "o2_final_pct": (num(c[6]) or 0) * 100 or None, "comment": c[17] or None}),
            test_label=c[3])


def autofill(acc, name, body, col, pattern, what):
    bad = [(l, c[col]) for l, c in body if re.search(pattern, c[col])]
    if bad:
        q(acc, name, "suspected_autofill_artifact",
          f"{len(bad)} cell(s) in '{what}' look like spreadsheet auto-increment artifacts "
          f"(e.g. {', '.join(sorted({b[1] for b in bad})[:4])}); such species/bottles do not exist as written.",
          [b[0] for b in bad], "warning")
    return {b[0] for b in bad}


def bre():
    acc, name = "PSI-20", "PSI-20_Experimental table_ACME BRE.csv"
    h, body, _ = read_table(tpath(name))
    for line, c in body:
        raw = c[5]
        notes = ["Row summarises one test day. Oxygen values are the approximate concentrations of tests that ignited; "
                 "chamber pressure was varied but is not identified in the table."]
        if re.fullmatch(r"\d{3,}%", raw):
            vals = [num(raw) / 100.0]
            q(acc, name, "suspected_format_error", f"Oxygen concentration written as '{raw}' (percent formatting applied to a percent value).", [line], "warning")
            notes.append(f"Source cell reads '{raw}'; interpreted as {vals[0]:g}% and flagged.")
        else:
            vals = nums(raw)
        add(acc, name, "main", line, h, c, "test_day", fuel=c[4].replace("%C", "% C"), fuel_original=c[4],
            geometry=f"flat porous burner {c[3]} mm (emulates condensed fuels), still atmosphere",
            o2_values=vals, o2_basis=LISTED, o2_role="ambient", o2_original=raw,
            flow_values_cm_s=[0.0], flow_basis=NOMINAL, flow_original="still atmosphere (per challenge statement)",
            n_flames=int(num(c[6])) if num(c[6]) is not None else None, notes=notes)


def cld():
    acc, name = "PSI-21", "PSI-21_Experimental table_CLD Flame.csv"
    h, body, _ = read_table(tpath(name))
    bad = autofill(acc, name, body, 4, r"CH(?!4\b)\d+|C2H(?!4\b)\d+", "Fuel Bottle")
    for line, c in body:
        add(acc, name, "main", line, h, c, "test_day", fuel=None if line in bad else c[4], fuel_original=c[4],
            geometry="coflow burner (fuel jet in air coflow)",
            n_flames=int(num(c[6])) if num(c[6]) is not None else None,
            measures=clean({"fuel_conc_range": c[5], "test_type": c[0]}),
            notes=["Row summarises one test day."] + (["Fuel bottle text is a suspected auto-increment artifact; not normalised."] if line in bad else []))


def efield():
    acc, name = "PSI-22", "PSI-22_Experimental table_ACME E-FIELD Flames.csv"
    h, body, _ = read_table(tpath(name))
    last = None
    for line, c in body:
        if not c[1]:  # continuation row: extra fuel concentration for the previous test day
            if last is not None and c[7]:
                last["measures"].setdefault("fuel_conc_list", []).append(c[7])
                last["notes"].append(f"Fuel concentration {c[7]} taken from continuation row {line}.")
            continue
        last = add(acc, name, "main", line, h, c, "test_day", fuel=c[6], fuel_original=c[6],
                   geometry="coflow or gas-jet burner with electric-field mesh",
                   n_flames=int(num(c[8])) if num(c[8]) is not None else None,
                   measures=clean({"mesh_polarity": c[5], "fuel_conc_list": [c[7]] if c[7] else None, "test_type": c[0]}),
                   notes=["Row summarises one test day."])
    q(acc, name, "continuation_rows", "Some rows hold only an extra 'Fuel Conc' value for the preceding test day; merged into that day.")


def sflame():
    acc, name = "PSI-23", "PSI-23_Experimental table_ACME s-Flame.csv"
    h, body, _ = read_table(tpath(name))
    bad = autofill(acc, name, body, 5, r"\bN[3-9]\b", "Atmosphere")
    bad |= autofill(acc, name, body, 6, r"\bN[3-9]\b", "Fuel Bottle")
    for line, c in body:
        add(acc, name, "main", line, h, c, "test_day", fuel=None if line in bad else c[6], fuel_original=c[6],
            geometry="spherical porous burner",
            o2_values=nums(c[5].replace("O2", "")), o2_basis=LISTED if "and" in c[5] else NOMINAL, o2_role="ambient", o2_original=c[5],
            pressure_values_kpa=[ATM], pressure_basis=NOMINAL, pressure_original="~1 atm (table footnote)",
            diluents={"He": None} if "He" in c[5] else {"N2": None},
            n_flames=int(num(c[7])) if num(c[7]) is not None else None,
            notes=["Row summarises one test day. Footnote: pressure increases and O2% drops with vitiation."]
                  + (["Atmosphere/bottle text contains a suspected auto-increment artifact (N3, N4...)."] if line in bad else []))


# ------------------------------------------------------------------------------------------
def variation(header, body):
    """What changed and what stayed the same inside one table."""
    out = []
    for i, name in enumerate(header):
        vals = [c[i] for _, c in body if c[i]]
        if not vals:
            continue
        uniq = collections.Counter(vals)
        numeric = [num(v) for v in vals if re.fullmatch(r"[-+]?\d*\.?\d+", v)]
        item = dict(column=name, filled=len(vals), unique=len(uniq))
        if len(uniq) == 1:
            item["kind"], item["value"] = "constant", vals[0]
        elif len(numeric) >= 0.8 * len(vals):
            item["kind"], item["min"], item["max"] = "numeric", min(numeric), max(numeric)
        elif len(uniq) > 0.9 * len(vals) and len(vals) > 10:
            item["kind"] = "identifier"
        else:
            item["kind"], item["top"] = "categorical", [[k, v] for k, v in uniq.most_common(6)]
        out.append(item)
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    flex(); flex2(); cfi(); bass2(); bass()
    saffire("PSI-98", "PSI-98_Experimental table_SAFFIRE-1.csv", dict(flow=5, o2=6, ignp=7, burn=9, dir=10))
    saffire("PSI-99", "PSI-99_Experimental table_SAFFIRE-2.csv", dict(flow=5, o2=6, ignp=7, burn=9, dir=10, ug_len=11))
    saffire("PSI-100", "PSI-100_Experimental table_SAFFIRE-3.csv", dict(flow=5, dir=6))
    same_r(); same(); daft(); spice(); slice_(); flame_design(); cfig(); bre(); cld(); efield(); sflame()

    q("PSI-99", "PSI-99_Experimental table_SAFFIRE-2.csv", "header_issue",
      "Header typos/encoding: 'Samle Thickness'; '?-g Burn Length' (the Greek mu of 'µ-g' was lost).", [1])
    q("PSI-98", "PSI-98_Experimental table_SAFFIRE-1.csv", "cross_table_inconsistency",
      "Saffire-I lists the SIBAL sample as length 40.6 cm x width 94 cm; Saffire-III lists the same sample type as "
      "length 94 cm x width 40.6 cm.", [2, 3])
    q("PSI-100", "PSI-100_Experimental table_SAFFIRE-3.csv", "missing_conditions",
      "No oxygen concentration column (present in Saffire-I and Saffire-II tables).", [1], "warning")
    q("ALL", "*", "heterogeneous_units",
      "Oxygen is given as % by volume (BASS-II, Saffire, BRE), mole fraction (FLEX, FLEX-2, CFI, CFI-G, Flame Design) "
      "or free text (s-Flame). Pressure is given in mmHg (FLEX), atm (Flame Design, FLEX-2, CFI) or bar (CFI-G). "
      "Unified here to % O2 by volume and kPa.")

    # generic duplicate-id check
    for name, col in (("PSI-69_Experimental table_FLEX.csv", 1), ("PSI-39_Experimental table_CFI.csv", 0)):
        h, body, _ = read_table(tpath(name))
        cnt = collections.defaultdict(list)
        for l, c in body:
            cnt[c[col]].append(l)
        d = {k: v for k, v in cnt.items() if len(v) > 1 and k}
        if d:
            q(name.split("_")[0], name, "duplicate_identifier",
              f"'{h[col]}' repeats for {len(d)} value(s): {', '.join(list(d)[:5])}.", [x for v in d.values() for x in v])

    # ---- investigations ----
    invs = []
    tables_by_acc = collections.defaultdict(list)
    for fn in sorted(os.listdir(os.path.join(RAW, "experimental_tables"))):
        acc = fn.split("_")[0]
        h, body, enc = read_table(tpath(fn))
        tables_by_acc[acc].append(dict(file=fn, rows=len(body), columns=h, encoding=enc, variation=variation(h, body)))
    by_acc = collections.defaultdict(list)
    for r in records:
        by_acc[r["accession"]].append(r)
    for acc, m in sorted(META.items(), key=lambda kv: int(kv[0].split("-")[1])):
        j = json.load(open(os.path.join(RAW, "investigations", acc + ".json")))
        recs = by_acc.get(acc, [])
        o2 = [v for r in recs for v in r["o2_values"] if r["o2_basis"] != ASSUMED]
        pr = [v for r in recs for v in r["pressure_values_kpa"] if r["pressure_basis"] != ASSUMED]
        fl = [v for r in recs for v in r["flow_values_cm_s"]]
        pubs = [dict(title=p.get("title"), authors=p.get("authorList"), doi=p.get("doi") or None) for p in (j.get("publications") or [])]
        invs.append(dict(
            accession=acc, short=m["short"], title=j.get("title"), acronym=j.get("investigationAcronym"),
            doi=j.get("doi"), license=j.get("licenseIdentifier") or None,
            psi_url=f"https://psi.nasa.gov/physci/repo/data/investigations/{acc}",
            project_type=j.get("projectType"), platform=j.get("flightProgram") or None,
            start=j.get("investigationStartDate") or None, end=j.get("investigationEndDate") or None,
            sub_area=j.get("subResearchArea") or None, hardware=j.get("experimentHardware") or None,
            total_bytes=float(j.get("totalFileSize") or 0),
            objective=j.get("objective"), approach=j.get("approach"), hypothesis=j.get("hypothesis"),
            impacts=j.get("researchImpacts"),
            contacts=[dict(name=f"{c.get('firstName', '')} {c.get('lastName', '')}".strip(),
                           role=(c.get("roles") or [{}])[0].get("annotationValue")) for c in (j.get("contacts") or [])],
            fuel_phase=m["phase"], facility=m["facility"], pillars=m["pillars"], tier=m["tier"], tier_reason=m.get("tier_reason"),
            diagnostics=DIAGNOSTICS.get(m["facility"]),
            publications=pubs, tables=tables_by_acc.get(acc, []), n_records=len(recs),
            n_flames=sum(r["n_flames"] or 0 for r in recs) or None,
            granularity=sorted({r["granularity"] for r in recs}),
            o2_range=[min(o2), max(o2)] if o2 else None, pressure_range_kpa=[min(pr), max(pr)] if pr else None,
            flow_range_cm_s=[min(fl), max(fl)] if fl else None,
            fuels=[k for k, _ in collections.Counter(r["fuel"] for r in recs if r["fuel"]).most_common(8)],
        ))

    meta = dict(generated=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                source="NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov/physci/repo/ , Research Area: Combustion Science",
                basis_vocabulary={RECORDED: "numeric value given per row in the PSI table",
                                  NOMINAL: "approximate/nominal value stated in the table",
                                  LISTED: "table lists several values or a range for the row; per-test assignment not given",
                                  ASSUMED: "NOT in the table: nominal ISS/Cygnus cabin air assumed (21% O2, 101.3 kPa)",
                                  UNVERIFIED: "instrument display reading; unit not stated in the table",
                                  MISSING: "not available in the PSI experimental table"},
                n_records=len(records), n_investigations=len(invs))
    json.dump(dict(meta=meta, tests=records), open(os.path.join(OUT, "tests.json"), "w"), ensure_ascii=False)
    json.dump(dict(meta=meta, investigations=invs), open(os.path.join(OUT, "investigations.json"), "w"), ensure_ascii=False)
    json.dump(dict(meta=meta, findings=quality), open(os.path.join(OUT, "quality_report.json"), "w"), ensure_ascii=False, indent=1)

    cols = ["id", "accession", "investigation", "table", "csv_row", "granularity", "fuel_phase", "facility", "pillars", "tier",
            "fuel", "fuel_original", "geometry", "n_flames", "o2_pct", "o2_basis", "o2_role", "o2_original",
            "pressure_kpa", "pressure_basis", "pressure_original", "flow_cm_s", "flow_basis", "flow_original",
            "flow_direction", "diluents", "outcome", "outcome_original", "measures", "notes"]
    with open(os.path.join(OUT, "tests.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for r in records:
            row = dict(r)
            row["o2_pct"] = "; ".join(f"{v:g}" for v in r["o2_values"])
            row["pressure_kpa"] = "; ".join(f"{v:g}" for v in r["pressure_values_kpa"])
            row["flow_cm_s"] = "; ".join(f"{v:g}" for v in r["flow_values_cm_s"])
            row["pillars"] = "; ".join(r["pillars"])
            row["diluents"] = json.dumps(r["diluents"]) if r["diluents"] else ""
            row["measures"] = json.dumps(r["measures"], ensure_ascii=False) if r["measures"] else ""
            row["notes"] = " | ".join(r["notes"])
            w.writerow(["" if row.get(c) is None else row.get(c) for c in cols])

    # ---- console summary ----
    print(f"records: {len(records)}  investigations: {len(invs)}  quality findings: {len(quality)}")
    g = collections.Counter(r["granularity"] for r in records)
    print("granularity:", dict(g))
    print("by phase:", dict(collections.Counter(r["fuel_phase"] for r in records)))
    print("flames represented by test-day rows:", sum(r["n_flames"] or 0 for r in records))
    for ph in ("solid", "droplet", "gas"):
        v = [x for r in records if r["fuel_phase"] == ph and r["o2_basis"] not in (ASSUMED, MISSING) for x in r["o2_values"]]
        print(f"  O2 range {ph}: {min(v):.1f}-{max(v):.1f}%  (n values {len(v)})")
    hi = [r for r in records if any(x >= 30 for x in r["o2_values"]) and r["o2_basis"] != ASSUMED]
    print("records with O2 >= 30%:", dict(collections.Counter((r["fuel_phase"], r["investigation"]) for r in hi)))
    print("O2 basis:", dict(collections.Counter(r["o2_basis"] for r in records)))
    print("pressure basis:", dict(collections.Counter(r["pressure_basis"] for r in records)))
    print("flow basis:", dict(collections.Counter(r["flow_basis"] for r in records)))
    print("quality kinds:", dict(collections.Counter(x["kind"] for x in quality)))
    for i in invs:
        print(f"  {i['accession']:8} {i['short'][:34]:34} n={i['n_records']:4} O2={i['o2_range']} P={i['pressure_range_kpa']} flow={i['flow_range_cm_s']}")


if __name__ == "__main__":
    main()
