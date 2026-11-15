#!/usr/bin/env python3
"""Data-derived flammability results from the unified PSI dataset.

1. FLEX  : cross-validated model of the visible-flame extinction diameter of a burning droplet as a
           function of ambient O2, diluent (CO2 / He), pressure, initial diameter and fuel.
2. CFI-G : empirical hot-ignition map in oxygen x pressure space (+ a cross-validated logistic model).

Everything is exploratory: models are only meaningful inside the tested ranges, which are exported
alongside the results. Output: data/processed/models.json

Disclosure: this code was written with the assistance of an AI coding assistant (Claude).
"""
import collections
import json
import os

import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.inspection import partial_dependence
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold, RepeatedKFold, RepeatedStratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "processed")
tests = json.load(open(os.path.join(OUT, "tests.json")))["tests"]
SEED = 7


def cv_regression(model, X, y, repeats=5):
    r2s, maes = [], []
    oof = np.zeros((repeats, len(y)))
    rkf = RepeatedKFold(n_splits=5, n_repeats=repeats, random_state=SEED)
    for i, (tr, te) in enumerate(rkf.split(X)):
        m = model().fit(X[tr], y[tr])
        oof[i // 5, te] = m.predict(X[te])
    for rep in range(repeats):
        p = oof[rep]
        r2s.append(1 - ((y - p) ** 2).sum() / ((y - y.mean()) ** 2).sum())
        maes.append(np.abs(y - p).mean())
    return dict(r2_mean=round(float(np.mean(r2s)), 3), r2_sd=round(float(np.std(r2s)), 3),
                mae_mean=round(float(np.mean(maes)), 3), mae_sd=round(float(np.std(maes)), 3)), oof.mean(axis=0)


# ------------------------------------------------------------------------------------------ FLEX
def flex():
    rows = []
    for r in tests:
        if r["accession"] != "PSI-69" or r["outcome"] == "disruption":
            continue
        m, d = r["measures"], r["diluents"] or {}
        if not r["o2_values"] or not r["pressure_values_kpa"]:
            continue
        if "extinction_diameter_mm" not in m or "initial_diameter_mm" not in m:
            continue
        rows.append(dict(id=r["id"], fuel=r["fuel"], o2=r["o2_values"][0], co2=100 * d.get("CO2", 0.0), he=100 * d.get("He", 0.0),
                         p=r["pressure_values_kpa"][0], d0=m["initial_diameter_mm"], dext=m["extinction_diameter_mm"],
                         outcome=r["outcome"], day=r["original"].get("Test Date", "")))
    feats = ["o2", "co2", "he", "p", "d0", "heptane"]
    X = np.array([[x["o2"], x["co2"], x["he"], x["p"], x["d0"], 1.0 if x["fuel"] == "Heptane" else 0.0] for x in rows])
    y = np.array([x["dext"] for x in rows])
    gbr = lambda: GradientBoostingRegressor(random_state=SEED, n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8)
    ridge = lambda: make_pipeline(StandardScaler(), Ridge(1.0))
    res_gbr, oof = cv_regression(gbr, X, y)
    res_ridge, _ = cv_regression(ridge, X, y)
    keep = [0, 1, 2, 3, 5]  # without initial diameter
    res_nod0, _ = cv_regression(gbr, X[:, keep], y)
    res_base = dict(mae_mean=round(float(np.abs(y - y.mean()).mean()), 3))
    res_d0, _ = cv_regression(ridge, X[:, [4]], y)
    # stricter check: whole test days held out together
    days = np.array([x["day"] for x in rows])
    pg = np.zeros(len(y))
    for tr, te in GroupKFold(5).split(X, y, days):
        pg[te] = gbr().fit(X[tr], y[tr]).predict(X[te])
    res_group = dict(r2=round(float(1 - ((y - pg) ** 2).sum() / ((y - y.mean()) ** 2).sum()), 3),
                     mae=round(float(np.abs(y - pg).mean()), 3), n_days=int(len(set(days))))
    final = gbr().fit(X, y)
    imp = dict(zip(feats, [round(float(v), 3) for v in final.feature_importances_]))

    curves = {}
    for fuel, flag in (("Methanol", 0.0), ("Heptane", 1.0)):
        sub = X[X[:, 5] == flag]
        for j, f in ((0, "o2"), (1, "co2"), (2, "he")):
            lo, hi = float(sub[:, j].min()), float(sub[:, j].max())
            if hi - lo < 1e-6:
                continue
            pd_ = partial_dependence(final, sub, [j], grid_resolution=25, percentiles=(0, 1))
            grid = pd_["grid_values"][0] if "grid_values" in pd_ else pd_["values"][0]
            curves.setdefault(fuel, {})[f] = dict(x=[round(float(v), 2) for v in grid],
                                                  y=[round(float(v), 3) for v in pd_["average"][0]],
                                                  n=int(len(sub)), tested_range=[lo, hi])
    domain = {f: [round(float(X[:, i].min()), 2), round(float(X[:, i].max()), 2)] for i, f in enumerate(feats[:5])}
    points = [dict(id=x["id"], fuel=x["fuel"], o2=x["o2"], co2=x["co2"], he=x["he"], p=round(x["p"], 1), d0=x["d0"],
                   dext=x["dext"], outcome=x["outcome"], pred=round(float(p), 3)) for x, p in zip(rows, oof)]
    # empirical summary by fuel x diluent family
    fam = collections.defaultdict(list)
    for x in rows:
        k = "CO2" if x["co2"] > 0 else "He" if x["he"] > 0 else "N2 only"
        fam[(x["fuel"], k)].append(x)
    summary = [dict(fuel=f, diluent=k, n=len(v), o2_min=min(a["o2"] for a in v), o2_max=max(a["o2"] for a in v),
                    median_extinction_mm=round(float(np.median([a["dext"] for a in v])), 2),
                    burned_to_completion=sum(a["outcome"] == "burned_to_completion" for a in v))
               for (f, k), v in sorted(fam.items())]
    return dict(
        title="FLEX: visible-flame extinction diameter of fuel droplets",
        target="extinction_diameter_mm", n=len(rows), features=feats,
        excluded="Tests ending in 'Disruption' and rows with missing diameter or pressure.",
        cv="5-fold cross-validation repeated 5 times (random splits)",
        metrics=dict(gradient_boosting=res_gbr, gradient_boosting_grouped_by_test_day=res_group, ridge=res_ridge,
                     initial_diameter_only=res_d0, gradient_boosting_without_initial_diameter=res_nod0,
                     baseline_predict_mean=res_base),
        feature_importance=imp, domain=domain, partial_dependence=curves, points=points, summary=summary,
        caveats=["Exploratory model fit to the PSI summary table only; not validated against the raw data or publications.",
                 "Initial droplet diameter alone explains about half of the variance; atmosphere and fuel add the rest. "
                 "Without the initial diameter the atmosphere cannot predict the absolute extinction diameter.",
                 "Holding out whole test days gives nearly the same score as random splits.",
                 "Valid only inside the tested ranges listed in 'domain'. It says nothing about solid materials."])


# ------------------------------------------------------------------------------------------ CFI-G
def cfig():
    rows = []
    for r in tests:
        if r["accession"] != "PSI-159" or not r["o2_values"] or not r["pressure_values_kpa"] or r["outcome"] is None:
            continue
        rows.append(dict(id=r["id"], flame="inverse" if "/inverse/" in r["id"] else "normal", fuel=r["fuel"],
                         o2=r["o2_values"][0], p=r["pressure_values_kpa"][0], hot=1 if r["outcome"] == "hot_ignition" else 0,
                         outcome=r["outcome"], end=r["measures"].get("end_mode"), burn=r["measures"].get("burn_time_s")))
    grid = collections.defaultdict(lambda: dict(n=0, hot=0, self_ext=0))

    def o2bin(v):
        for edge, lab in ((16, 14), (19.5, 18), (25, 21), (35, 30), (45, 40), (60, 50), (77, 70), (100, 85)):
            if v < edge:
                return lab
    for x in rows:
        pb = min((50, 100, 200, 300), key=lambda b: abs(b - x["p"]) / b)
        g = grid[(x["flame"], pb, o2bin(x["o2"]))]
        g["n"] += 1
        g["hot"] += x["hot"]
        g["self_ext"] += x["end"] == "self_extinguished"
    cells = [dict(flame=k[0], p_kpa=k[1], o2_pct=k[2], **v) for k, v in sorted(grid.items())]

    fuels = sorted({x["fuel"] for x in rows})
    X = np.array([[x["o2"], np.log(x["p"]), 1.0 if x["flame"] == "inverse" else 0.0] + [1.0 if x["fuel"] == f else 0.0 for f in fuels[1:]]
                  for x in rows])
    y = np.array([x["hot"] for x in rows])
    mk = lambda: make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=2000))
    accs, aucs = [], []
    for rep in range(5):
        p = cross_val_predict(mk(), X, y, cv=RepeatedStratifiedKFold(n_splits=5, n_repeats=1, random_state=SEED + rep), method="predict_proba")[:, 1]
        accs.append(((p > 0.5) == y).mean())
        aucs.append(roc_auc_score(y, p))
    base = max(y.mean(), 1 - y.mean())
    return dict(
        title="ACME CFI-G: hot ignition in oxygen x pressure space",
        n=len(rows), cells=cells,
        points=[dict(id=x["id"], flame=x["flame"], fuel=x["fuel"], o2=round(x["o2"], 1), p=round(x["p"], 1), hot=x["hot"],
                     outcome=x["outcome"], end=x["end"], burn=x["burn"]) for x in rows],
        logistic=dict(features=["o2_pct", "log_pressure", "inverse_flame"] + [f"fuel={f}" for f in fuels[1:]],
                      cv="5-fold stratified cross-validation repeated 5 times",
                      accuracy=round(float(np.mean(accs)), 3), auc=round(float(np.mean(aucs)), 3),
                      baseline_accuracy=round(float(base), 3),
                      verdict="A logistic model does not beat the majority-class baseline in accuracy, so the dashboard "
                              "shows the empirical counts only and makes no ignition prediction."),
        caveats=["'Hot ignition = No' means no hot flame was recorded; some of those tests report a cool flame instead.",
                 "For inverse flames the oxygen value is the O2 fraction of the oxidizer stream issuing from the burner "
                 "into a fuel/N2 atmosphere, not a cabin atmosphere.",
                 "Gaseous spherical flames on a porous burner: not a material flammability test."])


def main():
    out = dict(flex=flex(), cfig=cfig())
    json.dump(out, open(os.path.join(OUT, "models.json"), "w"), ensure_ascii=False)
    f, c = out["flex"], out["cfig"]
    print("FLEX n", f["n"], json.dumps(f["metrics"]))
    print("  importance", f["feature_importance"], "domain", f["domain"])
    for fu, d in f["partial_dependence"].items():
        for k, v in d.items():
            print(f"  PD {fu} {k}: x {v['x'][0]}..{v['x'][-1]}  y {v['y'][0]} -> {v['y'][-1]}")
    for s in f["summary"]:
        print("  ", s)
    print("CFI-G n", c["n"], c["logistic"])
    for cell in c["cells"]:
        print("  ", cell)


if __name__ == "__main__":
    main()
