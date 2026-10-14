"""Paths, source locations and the fixed choices the pipeline makes."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "raw"            # downloaded source files, never committed
DATA = ROOT / "data"          # published tables (committed)
BUILD = ROOT / "build"        # derived tables that depend on sources without a clear licence (not committed)
SITE = ROOT / "site"
ML_RESULTS = ROOT / "ml" / "results"

# --- airports: OurAirports (public domain) ---
OURAIRPORTS_URL = "https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv"

# --- 2014 routes: OpenFlights (Open Database License); the route file was last updated in June 2014 ---
OPENFLIGHTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/{name}"
OPENFLIGHTS_FILES = ("routes.dat", "airports.dat", "airlines.dat")
OPENFLIGHTS_YEAR, OPENFLIGHTS_DATE = "2014", "2014-06"

# --- 2021+ routes: github.com/Jonty/airline-route-data, one late-summer commit per year ---
# The repository has no licence file. Snapshots are downloaded at build time and are not committed here.
ROUTES_URL = "https://raw.githubusercontent.com/Jonty/airline-route-data/{commit}/airline_routes.json"
SNAPSHOTS = {                  # year: (snapshot date, commit)
    "2021": ("2021-08-29", "eb0aa4421e85b8f6bd68f8f1f23a4398241cc457"),
    "2022": ("2022-07-31", "c6db1d58b4d0bee8722b4d693cb14889175e9daf"),
    "2023": ("2023-07-30", "49ff53b484c2beded2843926465f306bbe59ec82"),
    "2024": ("2024-09-20", "15e8adefadb8e11450237a64c6a2b7a7bb2e62c9"),
    "2026": ("2026-09-25", "ff16a0749fd642e469a5f561a984e77ae3740b7f"),
}
# To add a year: pick a commit from late summer in that repository's history and add a line above.

# --- passengers, seats, flights: Eurostat route tables avia_par_<country> (reuse allowed with attribution) ---
EUROSTAT_URL = ("https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/avia_par_{cc}/{freq}..{measure}."
                "?format=SDMX-CSV&compressed=false")
EUROSTAT_COUNTRIES = ("be bg cz dk de ee ie el es fr hr it cy lv lt lu hu mt nl at pl pt ro si sk fi se "
                      "is no ch uk me mk rs tr").split()
EUROSTAT_MEASURES = {"PAS_CRD": "P", "ST_PAS": "S", "CAF_PAS": "C"}   # passengers carried, seats, flights
EUROSTAT_FIRST_YEAR = 1993
EUROSTAT_MONTHLY_CHUNK_YEARS = 4     # larger requests are queued by the API instead of answered
EUROSTAT_ANNUAL = DATA / "eurostat_algeria_routes_annual.csv"
EUROSTAT_MONTHLY = DATA / "eurostat_algeria_routes_monthly.csv"

# Eurostat reports two pseudo or renamed airports that OurAirports cannot resolve to the code used on the map.
EUROSTAT_SPECIAL = {           # ICAO-style code: (map code, name, city, country, country code, lon, lat)
    "LF90": ("PAR", "Paris airport system", "Paris, all airports", "France", "FR", 2.35, 48.86),
    "LTBA": ("ISL", "Istanbul Atatürk Airport", "Istanbul", "Turkiye", "TR", 28.8237, 40.9719),
}
# Carrier names that differ between the 2014 file and later snapshots, or that the sources get wrong.
CARRIER_NAMES = {"AZ": "Alitalia / ITA Airways", "KM": "Air Malta", "TB": "TUI fly Belgium", "AH": "Air Algérie",
                 "YO": "Unidentified carrier"}
EXTRA_AIRPORTS = {             # endpoints missing from every source
    "MLH": ("EuroAirport Basel-Mulhouse-Freiburg", "Mulhouse", "France", "FR", 7.5299, 47.59),
}
