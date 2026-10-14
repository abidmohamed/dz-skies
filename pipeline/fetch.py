"""Download the source files. Run as `python -m pipeline.fetch`.

Static sources are cached under raw/ and only downloaded when missing (use --refresh to re-download).
Eurostat is always re-queried, because it is the only source that changes between runs.
"""
import argparse, sys, time, urllib.error, urllib.request
from datetime import date

from . import config as C

UA = {"User-Agent": "dz-skies data pipeline (https://github.com/)"}


def _open(url, timeout=180):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout)


def download(url, dest, refresh=False, tries=3):
    if dest.exists() and dest.stat().st_size > 0 and not refresh:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(tries):
        try:
            with _open(url) as r, open(dest.with_suffix(dest.suffix + ".part"), "wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            dest.with_suffix(dest.suffix + ".part").replace(dest)
            print(f"  downloaded {dest.relative_to(C.ROOT)} ({dest.stat().st_size / 1e6:.1f} MB)")
            return True
        except Exception as e:                      # network errors are retried, then reported
            if attempt == tries - 1:
                raise RuntimeError(f"could not download {url}: {e}") from e
            time.sleep(3 * (attempt + 1))


def fetch_static(refresh=False):
    print("airports and routes")
    download(C.OURAIRPORTS_URL, C.RAW / "ourairports" / "airports.csv", refresh)
    for name in C.OPENFLIGHTS_FILES:
        download(C.OPENFLIGHTS_URL.format(name=name), C.RAW / "openflights" / name, refresh)
    for year, (day, commit) in C.SNAPSHOTS.items():   # pinned commits never change, so never refreshed
        download(C.ROUTES_URL.format(commit=commit), C.RAW / "routes" / f"{day}.json")


# ---------------------------------------------------------------- Eurostat
class TooLarge(Exception):
    """The API queued the request instead of answering it; ask for a shorter period."""


def eurostat_rows(cc, freq, measure, start=None, end=None, tries=3):
    """Rows for Algerian partner airports as (header, [lines]); None when the table or period has no data."""
    url = C.EUROSTAT_URL.format(cc=cc, freq=freq, measure=measure)
    if start: url += f"&startPeriod={start}"
    if end: url += f"&endPeriod={end}"
    for attempt in range(tries):
        try:
            header, rows = None, []
            with _open(url) as r:
                for raw in r:
                    line = raw.decode("utf-8").rstrip("\r\n")
                    if header is None:
                        if line.lstrip().startswith("<"):
                            raise TooLarge(url)
                        header = line
                    elif "_DZ_" in line:
                        rows.append(line)
            return header, rows
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):                 # no such table, or nothing in this period
                return None
            err = e
        except TooLarge:
            raise
        except Exception as e:
            err = e
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Eurostat request failed: {url}: {err}")


def eurostat_period(cc, measure, y0, y1):
    """Monthly rows for y0..y1, halving the period whenever the API refuses to answer in one go."""
    try:
        got = eurostat_rows(cc, "M", measure, f"{y0}-01", f"{y1}-12")
        return got[1] if got else []
    except TooLarge:
        if y0 == y1:
            raise
        mid = (y0 + y1) // 2
        return eurostat_period(cc, measure, y0, mid) + eurostat_period(cc, measure, mid + 1, y1)


def _write(path, header, rows):
    key = lambda l: (l.split(",")[5], l.split(",")[4], l.split(",")[6])     # route, measure, period
    rows = sorted(set(rows), key=key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join([header] + rows) + "\n", encoding="utf-8")
    print(f"  wrote {path.relative_to(C.ROOT)}: {len(rows)} rows")


def fetch_eurostat():
    print("Eurostat annual tables")
    header, annual, reporting = None, [], []
    for cc in C.EUROSTAT_COUNTRIES:
        found = 0
        for measure in C.EUROSTAT_MEASURES:
            got = eurostat_rows(cc, "A", measure)
            if got:
                header = header or got[0]; annual += got[1]; found += len(got[1])
        if found:
            reporting.append(cc); print(f"  {cc}: {found} rows")
    if not annual:
        raise RuntimeError("Eurostat returned no Algerian routes at all; keeping the existing files")
    _write(C.EUROSTAT_ANNUAL, header, annual)

    print("Eurostat monthly passengers, seats and flights for:", " ".join(reporting))
    monthly, last = [], date.today().year
    for cc in reporting:
        for measure in C.EUROSTAT_MEASURES:
            for y0 in range(C.EUROSTAT_FIRST_YEAR, last + 1, C.EUROSTAT_MONTHLY_CHUNK_YEARS):
                monthly += eurostat_period(cc, measure, y0, min(last, y0 + C.EUROSTAT_MONTHLY_CHUNK_YEARS - 1))
    _write(C.EUROSTAT_MONTHLY, header, monthly)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--refresh", action="store_true", help="re-download airports and OpenFlights files")
    ap.add_argument("--skip-eurostat", action="store_true", help="keep the Eurostat files already in data/")
    a = ap.parse_args(argv)
    fetch_static(a.refresh)
    if not a.skip_eurostat:
        fetch_eurostat()


if __name__ == "__main__":
    sys.exit(main())
