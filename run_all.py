"""Run the whole pipeline: download sources, forecast, build the site's data, validate.

    python run_all.py              # everything
    python run_all.py --offline    # reuse what is already in raw/ and data/
"""
import argparse, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def step(title, *cmd):
    print(f"\n== {title}")
    r = subprocess.run([sys.executable, *cmd], cwd=ROOT)
    if r.returncode:
        sys.exit(f"stopped: '{title}' failed")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--offline", action="store_true", help="skip all downloads")
    ap.add_argument("--skip-eurostat", action="store_true", help="download static sources but keep the Eurostat files in data/")
    a = ap.parse_args()
    if not a.offline:
        step("Download sources", "-m", "pipeline.fetch", *(["--skip-eurostat"] if a.skip_eurostat else []))
    step("Backtest and forecast", "ml/backtest.py")
    step("Build site data", "-m", "pipeline.build")
    step("Validate", "-m", "pipeline.validate")
    print("\nDone. Preview the site with:  python -m http.server 8000 --directory site")


if __name__ == "__main__":
    main()
