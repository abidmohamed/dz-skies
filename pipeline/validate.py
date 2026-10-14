"""Checks on the built data. Run as `python -m pipeline.validate`; exits non-zero on the first failure list."""
import csv, json, sys
from collections import defaultdict

from . import config as C


def check():
    errors, notes = [], []
    def need(ok, msg):
        if not ok: errors.append(msg)

    d = json.loads((C.SITE / "data.json").read_text(encoding="utf-8"))
    ap = {a["id"]: a for a in d["airports"]}
    need(len(ap) == len(d["airports"]), "duplicate Algerian airport ids")
    need(len(ap) >= 100, f"only {len(ap)} Algerian airports; OurAirports normally lists more than 100")
    for a in d["airports"]:
        need(-9.5 <= a["lon"] <= 12.5 and 18.5 <= a["lat"] <= 37.5, f"{a['id']} lies outside Algeria: {a['lon']}, {a['lat']}")

    for y, v in d["years"].items():
        need(len(v["dom"]) >= 30 and len(v["intl"]) >= 50, f"{y}: suspiciously few routes ({len(v['dom'])} domestic, {len(v['intl'])} international)")
        seen = set()
        for kind in ("dom", "intl"):
            for a, b, carriers, km, minutes in v[kind]:
                need((a, b) not in seen, f"{y}: duplicate route {a}-{b}"); seen.add((a, b))
                need(a in ap, f"{y}: {a}-{b} does not start at an Algerian airport")
                need((b in ap) if kind == "dom" else (b in d["foreign"] and b not in ap), f"{y}: {a}-{b} filed under the wrong type")
                need(km and km > 0, f"{y}: {a}-{b} has no distance")
                need(carriers and all(c in d["carriers"] for c in carriers), f"{y}: {a}-{b} has an unnamed carrier")
    for code, f in d["foreign"].items():
        need(-180 <= f["lon"] <= 180 and -90 <= f["lat"] <= 90 and f["country"], f"airport {code} has a bad position or no country")

    if "es" in d:
        e = d["es"]; n = e["y1"] - e["y0"] + 1
        for p in e["pairs"]:
            need(p["a"] in ap and p["b"] in d["foreign"], f"Eurostat route {p['a']}-{p['b']} has an unknown airport")
            for m in "PSC":
                need(len(p[m]) == n and all(v is None or v >= 0 for v in p[m]), f"Eurostat {p['a']}-{p['b']} {m}: bad series")
        # monthly passengers must add up to the annual figure wherever all twelve months are published
        if C.EUROSTAT_MONTHLY.exists():
            annual, monthly = {}, defaultdict(list)
            with open(C.EUROSTAT_ANNUAL, encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    if r["tra_meas"] == "PAS_CRD" and r["OBS_VALUE"]: annual[(r["airp_pr"], r["TIME_PERIOD"])] = int(r["OBS_VALUE"])
            with open(C.EUROSTAT_MONTHLY, encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    if r["tra_meas"] == "PAS_CRD" and r["OBS_VALUE"]: monthly[(r["airp_pr"], r["TIME_PERIOD"][:4])].append(int(r["OBS_VALUE"]))
            full = {k: sum(v) for k, v in monthly.items() if len(v) == 12}
            off = [k for k, s in full.items() if k in annual and s != annual[k]]
            need(not off, f"monthly passengers do not add up to the annual figure for {len(off)} route-years, e.g. {off[:3]}")
            notes.append(f"{len(full)} route-years have all twelve months; {sum(1 for k in full if k in annual)} were compared with the annual table")
        if "fc" in e:
            for g, v in e["fc"]["g"].items():
                need(all(lo <= f <= hi and lo >= 0 for lo, f, hi in zip(v["lo"], v["fc"], v["hi"])), f"forecast range out of order for {g}")
    return errors, notes


def main():
    errors, notes = check()
    for n in notes: print("  " + n)
    for e in errors: print("  FAILED:", e)
    print(f"  {'all checks passed' if not errors else str(len(errors)) + ' check(s) failed'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
