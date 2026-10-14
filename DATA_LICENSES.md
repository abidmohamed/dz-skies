# Data sources and their terms

The MIT licence in `LICENSE` covers the code only. Each data source keeps its own terms.
This page is a working summary, not legal advice. Check the original terms before any commercial use.

| Source | Used for | Terms | In this repository |
|---|---|---|---|
| [OurAirports](https://ourairports.com/data/) | Algerian airports, airfields, heliports; airport codes | Public domain | `data/airports_dz.csv` is committed |
| [Eurostat `avia_par_*`](https://ec.europa.eu/eurostat/databrowser/view/avia_par_fr/default/table?lang=en) | Passengers, seats and flights on Algeria–Europe routes, 1993 onwards | Reuse allowed, including commercial, if the source is acknowledged ([copyright notice](https://ec.europa.eu/eurostat/help/copyright-notice)) | `data/eurostat_algeria_routes_*.csv` are committed |
| [OpenFlights](https://openflights.org/data.php) | Routes listed in 2014 | Open Database License (share-alike) | Downloaded at build time, not committed |
| [Jonty/airline-route-data](https://github.com/Jonty/airline-route-data) | Routes listed from 2021 onwards | **No licence file.** The repository scrapes flightsfrom.com | Downloaded at build time, not committed |
| [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas) | Base map | Public domain (world-atlas code: ISC) | `site/world.json` is committed |

## Open questions

- **Routes from 2021 onwards.** The source has no licence, so this repository does not redistribute its files.
  The deployed site still shows routes derived from it. Before promoting the project, ask the author to add a
  licence, or replace the source.
- **Routes from 2014.** Any published table that contains OpenFlights rows must be shared under the Open Database
  License. That is why `build/routes_by_year.csv` is not committed alongside the other tables.
- **Eurostat exceptions.** Eurostat limits some data to non-commercial reuse, notably data about countries outside the
  EU, EFTA and candidate countries. The rows here are reported by European airports, but the United Kingdom rows
  (2008 to 2017) should be checked before commercial use.

## How to credit

- Eurostat: "Source: Eurostat, air passenger transport routes between partner airports and main airports
  (avia_par)". Say that figures were filtered to Algerian routes and aggregated.
- OurAirports, OpenFlights and Natural Earth: name the source and link to it.
