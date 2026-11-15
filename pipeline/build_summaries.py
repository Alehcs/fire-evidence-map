#!/usr/bin/env python3
"""Plain-language summaries of the 24 PSI combustion investigations.

The summaries below were drafted by a large language model (Claude, Anthropic) from the PSI record text only
(objective, approach, research impacts). Each carries one supporting quote. This script keeps a quote only if it
appears verbatim in the PSI record, so no quote can be invented. Output: data/processed/summaries.json
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "processed")

S = {
    "PSI-10": ("Burned gas flames on a spherical burner to find when soot starts to form, across flow, dilution and pressure.",
               "Background science: soot limits feed combustion models. Not a material test.",
               "Obtain soot-inception limits of quasi-steady normal and inverse spherical diffusion flames"),
    "PSI-20": ("Used a flat gas burner to imitate burning solids and liquids in still air, at atmospheres NASA considers for crewed missions.",
               "Shows a material can keep burning with no air flow, so stopping ventilation is not enough.",
               "observed in microgravity despite the absence of air flow"),
    "PSI-21": ("Studied weak and sooty gas flames in a stream of air to test computer models at the extremes of fuel dilution.",
               "Background science: better flame and soot models.",
               "Characterize the behavior of weak coflow diffusion flames of methane and ethylene"),
    "PSI-22": ("Applied electric fields to small gas flames to see how the field changes their shape, soot and stability.",
               "Background science. The challenge notes the electric field was used to mimic partial gravity.",
               "investigates how electric fields influence the behavior of laminar diffusion flames in microgravity"),
    "PSI-23": ("Created spherical gas flames around a porous burner to test models of flame structure and extinction.",
               "Background science: how simple flames behave near their limits.",
               "a spherical, one-dimensional stabilized flame"),
    "PSI-25": ("Burned plastic sheets, rods and fabric in a small wind tunnel on the ISS, varying air speed and oxygen.",
               "Direct evidence on how cabin materials ignite, spread flame and go out in microgravity.",
               "Study the ignition, flame growth, flame spread, and extinction limits for solid fuels burning in low-velocity forced flows in microgravity"),
    "PSI-26": ("Burned fabric, plastic spheres and candles on the ISS, then tried to put the flames out with an inert gas.",
               "Tests whether the Earth screening test for materials holds in space, and how to extinguish.",
               "actual material flammability in microgravity"),
    "PSI-39": ("Burned droplets of dodecane fuel at pressures from 0.25 to 5 atm to study cool flames.",
               "Background science on cool flames, which keep reacting without a visible flame.",
               "Analyze the effects of helium dilution on cool flame behavior"),
    "PSI-47": ("Checked that a modified particle counter works in microgravity before using it to measure smoke.",
               "Supports reliable smoke detection on long missions.",
               "Demonstrate the Functionality of the Modified TSI P-Trak in Microgravity"),
    "PSI-60": ("Reanalyzed more than 1,600 SPICE flame photos to map soot temperature and amount.",
               "Background science on soot in microgravity flames.",
               "By analyzing over 1600 raw DSLR images"),
    "PSI-62": ("Built computer models of flames spreading along solids in microgravity, checked against BASS geometries.",
               "Aims at tools to screen the flammability of new materials.",
               "predictive tools for screening new materials"),
    "PSI-68": ("Burned droplets of several fuels and mixtures at 0.5 to 3 atm and different oxygen levels.",
               "Extends FLEX to more fuels. Benchmark data for combustion models.",
               "varied in pressure between 0.5 atm to 3.0 atm"),
    "PSI-69": ("Burned large fuel droplets while adding gases such as CO2 or helium, to find when the flame goes out.",
               "Measures how well gas suppressants work in microgravity.",
               "measure the effectiveness of various gaseous fire suppressants such as CO2, He, and SF6"),
    "PSI-98": ("Lit a large sheet of cotton-fiberglass fabric inside an uncrewed cargo ship after it left the ISS.",
               "A first look at how fast a large fire grows in low gravity.",
               "determine how rapidly a large scale fire grows in low-gravity"),
    "PSI-99": ("Burned nine smaller samples, including silicone, fabric and plastic, inside an uncrewed cargo ship.",
               "Compares flammability limits in low gravity with NASA's ground screening test.",
               "investigate the low-g flammability limits compared to those obtained in"),
    "PSI-100": ("Repeated the large fabric burn of Saffire-I with faster air: 30 cm/s instead of 20.",
                "Shows how air speed changes the growth of a large fire.",
                "the experiments were conducted at a flow velocity of 30 cm/s compared to 20 cm/s during Saffire I"),
    "PSI-101": ("Overheated spacecraft materials and measured the smoke particles, with new instruments and a new foam sample.",
                "Data to design smoke detectors that work in microgravity.",
                "quantify the sizes that the liquid smoke particulate achieves in low gravity"),
    "PSI-102": ("Overheated spacecraft materials on the ISS and measured the size of the smoke particles.",
                "Smoke differs in microgravity, so detectors must be tuned for it.",
                "quantify the sizes that the liquid smoke particulate achieves in low gravity"),
    "PSI-106": ("Studied small gas flames that lift off the burner, to learn what keeps a flame anchored.",
                "Background science on flame stability.",
                "better understand the structure and stability of laminar diffusion flames in microgravity"),
    "PSI-107": ("Burned gas jets in a stream of air to find the point where a flame starts to smoke.",
                "Background science on soot and smoke production.",
                "Identify the laminar smoke-point properties of non-buoyant jet diffusion flames"),
    "PSI-115": ("Simulated how smoke particles grow in microgravity and in Earth gravity, using the SAME setup.",
                "Explains why smoke differs in space, which matters for detectors.",
                "quantify the differences between microgravity and Earth gravity smoke"),
    "PSI-117": ("Simulated droplet cool flames from FLEX to see how heating and drift change their fate.",
                "Could improve fire-safety models of cool flames.",
                "Potential to improve spacecraft fire-safety modeling"),
    "PSI-142": ("Used FLEX data, simulations and lab flames to map the limits of cool flames.",
                "Links the extinction limits of hot flames and cool flames.",
                "Bridge the knowledge gap between the flammability limits and extinction limits of hot flames and cool flames"),
    "PSI-159": ("Burned light hydrocarbon gases on a spherical burner to find when cool flames appear.",
                "Holds the highest-oxygen tests in the archive, up to 85%.",
                "Determine the conditions for which cool diffusion flames occur"),
}


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def main():
    invs = json.load(open(os.path.join(OUT, "investigations.json")))["investigations"]
    out, dropped = {}, []
    for i in invs:
        acc = i["accession"]
        if acc not in S:
            print("missing summary:", acc)
            continue
        summary, relevance, quote = S[acc]
        source = norm(" ".join([i.get("objective") or "", i.get("approach") or "", i.get("impacts") or ""]))
        ok = norm(quote) in source
        if not ok:
            dropped.append(acc)
        out[acc] = dict(summary=summary, relevance=relevance, quotes=[quote] if ok else [], model="Claude (Anthropic)", verified_quote=ok)
    json.dump(dict(note="Summaries drafted by a language model from PSI record text. Quotes are kept only if found verbatim in the record.",
                   summaries=out), open(os.path.join(OUT, "summaries.json"), "w"), ensure_ascii=False, indent=1)
    words = [len((v["summary"] + " " + v["relevance"]).split()) for v in out.values()]
    print(f"summaries: {len(out)}  quotes verified: {len(out) - len(dropped)}  dropped: {dropped}  avg words: {sum(words) / len(words):.0f}")


if __name__ == "__main__":
    main()
