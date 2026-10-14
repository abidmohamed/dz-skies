"""Build the site's data file and the published tables from the downloaded sources.

Run as `python -m pipeline.build`. Reads raw/ and data/, writes site/data.json, data/airports_dz.csv
and build/routes_by_year.csv.
"""
import csv, json, math, sys

from . import config as C

AIRPORT_CLASS = {"large_airport": "L", "medium_airport": "M", "small_airport": "S", "heliport": "H"}


def great_circle_km(a, b):
    """Distance between two (lon, lat) points on a sphere of radius 6371 km."""
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dl = math.radians(b[0] - a[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * 6371.0 * math.asin(math.sqrt(h)))


class Builder:
    def __init__(self):
        self.log = []
        self.foreign = {}        # map code -> {name, city, country, cc, lon, lat}
        self.carriers = {}       # airline code -> name
        self.years = {}          # year -> {(algerian airport, other airport): {c: carriers, km, min}}

    # ------------------------------------------------------------ airports
    def load_airports(self):
        with open(C.RAW / "ourairports" / "airports.csv", encoding="utf-8") as f:
            self.oa = list(csv.DictReader(f))
        self.oa_iata = {r["iata_code"]: r for r in self.oa if r["iata_code"] and r["type"] != "closed"}
        self.oa_icao = {r["icao_code"]: r for r in self.oa if r["icao_code"] and r["type"] != "closed"}
        self.dz = []
        for r in self.oa:
            if r["iso_country"] != "DZ" or r["type"] == "closed":
                continue
            self.dz.append({
                "id": r["iata_code"] or r["ident"], "iata": r["iata_code"],
                "icao": r["icao_code"] or r["gps_code"] or r["ident"],
                "name": r["name"], "city": r["municipality"], "t": AIRPORT_CLASS.get(r["type"], "S"),
                "lon": round(float(r["longitude_deg"]), 4), "lat": round(float(r["latitude_deg"]), 4),
                "elev": int(float(r["elevation_ft"]) * 0.3048) if r["elevation_ft"] else None,
                "wiki": r["wikipedia_link"], "sched": r["scheduled_service"] == "yes",
            })
        self.dz_iata = {a["iata"] for a in self.dz if a["iata"]}
        self.dz_by_icao = {a["icao"]: a["id"] for a in self.dz}

    def add_foreign(self, code, name, city, country, cc, lon, lat):
        if code not in self.foreign:
            self.foreign[code] = {"name": name, "city": city, "country": country, "cc": cc,
                                  "lon": round(float(lon), 3), "lat": round(float(lat), 3)}

    def orient(self, s, t):
        """Put the Algerian airport first; domestic pairs are stored once, in alphabetical order."""
        if s in self.dz_iata and t in self.dz_iata:
            return tuple(sorted((s, t)))
        return (s, t) if s in self.dz_iata else (t, s)

    # ------------------------------------------------------------ route snapshots (2021 onwards)
    def load_snapshots(self):
        self.snaps, self.name2code = {}, {}
        for year, (day, _) in C.SNAPSHOTS.items():
            with open(C.RAW / "routes" / f"{day}.json", encoding="utf-8") as f:
                self.snaps[year] = json.load(f)
            for v in self.snaps[year].values():
                for r in v.get("routes", []):
                    for c in r.get("carriers", []):       # recent snapshots carry {iata, name}; older ones only names
                        if isinstance(c, dict) and c.get("iata"):
                            self.carriers[c["iata"]] = c["name"]; self.name2code[c["name"]] = c["iata"]
        self.newest_first = sorted(self.snaps, reverse=True)

    def carrier_code(self, c):
        if isinstance(c, dict):
            return c.get("iata") or c.get("name")
        if c in self.name2code:
            return self.name2code[c]
        if c in self.of_name2code:
            self.carriers.setdefault(self.of_name2code[c], c)
            return self.of_name2code[c]
        self.log.append(f"carrier without a code: {c}")
        self.carriers[c] = c
        return c

    def snapshot_routes(self, year):
        j = self.snaps[year]
        in_dz = {k for k, v in j.items() if v.get("country_code") == "DZ"}
        for k in sorted(in_dz - self.dz_iata):
            self.log.append(f"{year}: Algerian airport {k} ({j[k]['name']}) is not in OurAirports")
        pairs = {}
        for s, v in j.items():
            for r in v.get("routes", []):
                t = r["iata"]
                if (s not in in_dz and t not in in_dz) or (s not in self.dz_iata and t not in self.dz_iata):
                    continue
                if s == t:                          # the source occasionally lists an airport as its own destination
                    self.log.append(f"{year}: dropped self-route {s}-{t}"); continue
                a, b = self.orient(s, t)
                if b not in self.dz_iata:
                    if b in j:
                        x = j[b]; self.add_foreign(b, x["name"], x["city_name"], x["country"], x["country_code"], x["longitude"], x["latitude"])
                    elif b in self.oa_iata:
                        x = self.oa_iata[b]; self.add_foreign(b, x["name"], x["municipality"], x["iso_country"], x["iso_country"], x["longitude_deg"], x["latitude_deg"])
                    else:
                        self.log.append(f"{year}: unknown airport {b}"); continue
                p = pairs.setdefault((a, b), {"c": set(), "km": r.get("km"), "min": r.get("min")})
                for c in r.get("carriers", []):
                    p["c"].add(self.carrier_code(c))
        self.years[year] = pairs

    # ------------------------------------------------------------ 2014 routes (OpenFlights)
    def load_openflights(self):
        d = C.RAW / "openflights"
        self.of_air = {}
        with open(d / "airports.dat", encoding="utf-8") as f:
            for r in csv.reader(f):
                if r[4] != "\\N": self.of_air[r[4]] = r
        self.of_dz = {k for k, r in self.of_air.items() if r[3] == "Algeria"}
        with open(d / "airlines.dat", encoding="utf-8") as f:
            self.of_line = {r[0]: (r[3], r[1]) for r in csv.reader(f)}       # airline id -> (code, name)
        self.of_name2code = {nm: code for code, nm in self.of_line.values() if code and code not in ("\\N", "-")}

    def openflights_routes(self):
        pairs = {}
        with open(C.RAW / "openflights" / "routes.dat", encoding="utf-8") as f:
            for r in csv.reader(f):
                al, alid, s, t, codeshare, stops = r[0], r[1], r[2], r[4], r[6], r[7]
                if (s not in self.of_dz and t not in self.of_dz) or stops != "0" or s == t:
                    continue
                if s not in self.dz_iata and t not in self.dz_iata:
                    self.log.append(f"2014: Algerian code not in OurAirports {s}-{t}"); continue
                a, b = self.orient(s, t)
                if b not in self.dz_iata:
                    if b in C.EXTRA_AIRPORTS:
                        self.add_foreign(b, *C.EXTRA_AIRPORTS[b])
                    elif b in self.of_air:
                        x = self.of_air[b]; self.add_foreign(b, x[1], x[2], x[3], "", x[7], x[6])
                    else:
                        self.log.append(f"2014: unknown airport {b}"); continue
                self.carriers.setdefault(al, self.of_line.get(alid, (al, al))[1])
                p = pairs.setdefault((a, b), {"c": set(), "cs": set(), "km": None, "min": None})
                (p["cs"] if codeshare == "Y" else p["c"]).add(al)
        for p in pairs.values():                  # keep operating carriers; fall back to codeshares if none is listed
            if not p["c"]: p["c"] = p["cs"]
        self.years[C.OPENFLIGHTS_YEAR] = pairs

    # ------------------------------------------------------------ Eurostat
    def eurostat_code(self, icao):
        if icao in C.EUROSTAT_SPECIAL:
            code, *rest = C.EUROSTAT_SPECIAL[icao]
            self.add_foreign(code, *rest)
            return code
        x = self.oa_icao[icao]
        self.add_foreign(x["iata_code"], x["name"], x["municipality"], x["iso_country"], x["iso_country"], x["longitude_deg"], x["latitude_deg"])
        return x["iata_code"]

    def load_eurostat(self):
        if not C.EUROSTAT_ANNUAL.exists():
            self.es = None; return
        with open(C.EUROSTAT_ANNUAL, encoding="utf-8") as f:
            rows = [r for r in csv.DictReader(f) if r["OBS_VALUE"] != ""]
        y0, y1 = min(int(r["TIME_PERIOD"]) for r in rows), max(int(r["TIME_PERIOD"]) for r in rows)
        pairs, updated = {}, {}
        with open(C.EUROSTAT_ANNUAL, encoding="utf-8") as f:
            for r in csv.DictReader(f):
                pr = r["airp_pr"]; cc, eu, dz = pr[:2], pr[3:7], pr[11:15]
                assert pr[8:10] == "DZ" and r["freq"] == "A", pr
                dd, mm, yy = r["LAST UPDATE"].split(" ")[0].split("/"); updated[cc] = f"20{yy}-{mm}-{dd}"
                code, a = self.eurostat_code(eu), self.dz_by_icao[dz]
                if r["OBS_VALUE"] == "":            # confidential or missing
                    continue
                n = y1 - y0 + 1
                rec = pairs.setdefault((a, code), {"a": a, "b": code, "cc": cc, "P": [None] * n, "S": [None] * n, "C": [None] * n})
                m, i = C.EUROSTAT_MEASURES[r["tra_meas"]], int(r["TIME_PERIOD"]) - y0
                assert rec[m][i] is None, f"duplicate Eurostat value {pr} {r['TIME_PERIOD']}"
                rec[m][i] = int(r["OBS_VALUE"])
        self.es = {"y0": y0, "y1": y1, "upd": updated, "pairs": [pairs[k] for k in sorted(pairs)]}
        fc = C.ML_RESULTS / "forecast_groups.json"
        if fc.exists():
            g = json.loads(fc.read_text(encoding="utf-8"))
            code = lambda k: "*" if k == "*" else self.dz_by_icao.get(k) or self.eurostat_code(k)
            self.es["fc"] = {"last": g["last"], "eff": g["calendar_effects"], "g": {code(k): v for k, v in g["groups"].items()}}

    # ------------------------------------------------------------ assemble
    def finish(self):
        # names, cities and positions: prefer the newest snapshot that knows the airport
        cc2name = {v["country_code"]: v["country"] for v in self.snaps[self.newest_first[0]].values()}
        special = {v[0] for v in C.EUROSTAT_SPECIAL.values()}
        for code, f in self.foreign.items():
            if code in special:
                continue
            for y in self.newest_first:
                if code in self.snaps[y]:
                    x = self.snaps[y][code]
                    f.update(name=x["name"], city=x["city_name"], country=x["country"], cc=x["country_code"],
                             lon=round(float(x["longitude"]), 3), lat=round(float(x["latitude"]), 3))
                    break
            else:
                if code in self.oa_iata:
                    f["cc"] = self.oa_iata[code]["iso_country"]; f["country"] = cc2name.get(f["cc"], f["country"])
        for a in self.dz:                         # city served, not the commune the runway sits in
            for y in self.newest_first:
                x = self.snaps[y].get(a["iata"]) if a["iata"] else None
                if x and x.get("country_code") == "DZ" and x.get("city_name"):
                    a["city"] = x["city_name"]; break
        pos = {a["iata"]: (a["lon"], a["lat"]) for a in self.dz if a["iata"]}
        pos.update({k: (v["lon"], v["lat"]) for k, v in self.foreign.items()})
        years = {}
        for y in sorted(self.years):
            dom, intl = [], []
            for (a, b), p in sorted(self.years[y].items()):
                km = p["km"] or great_circle_km(pos[a], pos[b])
                (dom if b in self.dz_iata else intl).append([a, b, sorted(p["c"]), km, p["min"]])
            years[y] = {"dom": dom, "intl": intl}
        self.carriers.update(C.CARRIER_NAMES)
        used = {c for v in years.values() for k in ("dom", "intl") for r in v[k] for c in r[2]}
        data = {
            "snap": {C.OPENFLIGHTS_YEAR: C.OPENFLIGHTS_DATE, **{y: d for y, (d, _) in C.SNAPSHOTS.items()}},
            "airports": sorted(self.dz, key=lambda a: a["id"]),
            "foreign": dict(sorted(self.foreign.items())),
            "carriers": {k: self.carriers[k] for k in sorted(used)},
            "years": years,
        }
        if self.es:
            for p in self.es["pairs"]:
                p["km"] = great_circle_km(pos[p["a"]], pos[p["b"]])
            data["es"] = self.es
        return data


def build():
    b = Builder()
    b.load_airports()
    b.load_openflights()
    b.load_snapshots()
    b.openflights_routes()
    for year in C.SNAPSHOTS:
        b.snapshot_routes(year)
    b.load_eurostat()
    return b.finish(), sorted(set(b.log))


def write(data):
    C.SITE.mkdir(exist_ok=True); C.DATA.mkdir(exist_ok=True); C.BUILD.mkdir(exist_ok=True)
    (C.SITE / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with open(C.DATA / "airports_dz.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "iata", "icao", "name", "city", "class", "lon", "lat", "elevation_m", "wikipedia"])
        for a in data["airports"]:
            w.writerow([a["id"], a["iata"], a["icao"], a["name"], a["city"], a["t"], a["lon"], a["lat"], a["elev"], a["wiki"]])
    with open(C.BUILD / "routes_by_year.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["year", "from", "to", "type", "airlines", "distance_km", "flight_minutes"])
        for y, v in data["years"].items():
            for k, label in (("dom", "domestic"), ("intl", "international")):
                for a, b, c, km, mn in v[k]:
                    w.writerow([y, a, b, label, " ".join(c), km, mn if mn is not None else ""])


def main():
    data, log = build()
    write(data)
    for y, v in data["years"].items():
        print(f"  {y}: {len(v['dom'])} domestic, {len(v['intl'])} international routes")
    if "es" in data:
        e = data["es"]; i = len(e["pairs"][0]["P"]) - 1
        print(f"  Eurostat {e['y0']}-{e['y1']}: {len(e['pairs'])} routes, "
              f"{sum(p['P'][i] or 0 for p in e['pairs']):,} passengers in {e['y1']}, forecast {'included' if 'fc' in e else 'missing'}")
    for line in log:
        print("  note:", line)
    print(f"  wrote site/data.json ({(C.SITE / 'data.json').stat().st_size / 1e3:.0f} kB), {len(data['airports'])} Algerian airports")


if __name__ == "__main__":
    sys.exit(main())
