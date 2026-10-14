# Contributing

Thanks for helping. The project has three parts, and each has work that needs no knowledge of the others.

## Data (no coding needed for some of it)

- **Domestic traffic is the biggest gap.** Nothing here counts passengers on flights inside Algeria. If you can find
  official airport or airline statistics (annual reports, statistical yearbooks), open an issue with the source, or
  transcribe one year into a CSV with the columns `year, airport, passengers, source_url`.
- **Check a route.** Some listed routes are stale. If you know a route stopped or started, open an issue with the
  airports, the airline, the date and a source.
- **Routes outside Europe.** Passenger figures for routes to Africa, the Middle East and elsewhere are missing.

## Models

See `ml/README.md`. Add a model to the benchmark, run `python ml/backtest.py`, and report the scores it prints.
Changes to the test years or the scoring rule need their own issue first, because they make old results
incomparable.

## Site

- Translations into French and Arabic.
- An animation that plays through the years.
- Accessibility fixes: keyboard use, screen-reader labels, contrast.

## Working on the code

```
pip install -r requirements.txt
python run_all.py            # downloads sources, runs the benchmark, builds and validates the data
python -m http.server 8000 --directory site
```

`python run_all.py --offline` reuses what is already downloaded. Run `python -m pipeline.validate` before opening a
pull request; it must report that all checks passed.

Please keep pull requests to one change each, and say in the description what you ran to check it.
