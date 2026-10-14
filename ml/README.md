# Forecast benchmark

How well can monthly passengers on Algeria–Europe routes be forecast a year ahead?

## Protocol

- **Data:** Eurostat monthly passengers carried, both directions, per route (`data/eurostat_algeria_routes_monthly.csv`).
  Monthly figures start in 2002. Only route-years with all twelve months published are used.
- **Task:** standing at the end of year T−1, forecast the 12 months of year T for every route published in full for
  both T−1 and T.
- **Test years:** 2018 and 2019 (normal years), 2023 (rebound after COVID), 2024 (normal year).
- **COVID:** 2020 to 2022 are never training targets, and growth measured across those years is treated as missing.
- **Score:** total absolute error as a share of total passengers (WAPE). Lower is better. All models are scored on the
  same route-months.

Run it with `python ml/backtest.py`. It rewrites everything in `ml/results/`.

## Results

| Model | 2018 | 2019 | 2023 | 2024 |
|---|---|---|---|---|
| Same month last year (baseline) | 10.9% | 16.1% | 27.3% | 12.5% |
| Baseline + Ramadan/Eid correction | 9.6% | 14.6% | 27.2% | 11.8% |
| Baseline x route's last growth | 12.8% | 16.5% | 27.3% | 12.5% |
| Baseline x network growth | 11.8% | 15.9% | 27.3% | 12.5% |
| Annual total x seasonal profile | 12.2% | 17.9% | 27.3% | 12.5% |
| Holt-Winters per route | 10.9% | 15.0% | 21.5% | 12.7% |
| Gradient boosting, pooled | 12.1% | 15.5% | 20.3% | 16.5% |
| Gradient boosting + calendar features | 11.5% | 13.9% | 20.6% | 17.1% |
| Routes tested | 27 | 25 | 13 | 28 |

The table is regenerated as `ml/results/scores.md`.

## What the results say

- The naive baseline is hard to beat. Only the Ramadan/Eid correction beats it in all four years, and by a modest
  margin: it lowers the error on 81 of the 93 route-years tested.
- A month fully inside Ramadan carries roughly a third fewer passengers than it otherwise would. This is the one
  effect the models learn reliably.
- No model predicts the 2023 rebound from history.
- The gradient-boosting models win in some years and lose in others, so they are not used on the site.

## The model the site uses

`last_year_calendar_corrected`: the same month of the last reported year, multiplied by a correction for how much of
the month falls in Ramadan and in the two Eid weeks. The correction is fitted by weighted least squares on all earlier
years and is centred, so it moves traffic between months without changing the annual total. It assumes no growth.

The shaded range on the site is the 10th to 90th percentile of past forecast errors. Checked on the test years, that
80% range contained 70% of actual months in 2018 and 2019, 82% in 2024 and 40% in 2023
(`ml/results/interval_coverage.csv`). It is somewhat too narrow.

## Caveats

- The test years were looked at once before the COVID rule above was fixed, so they are not a perfectly clean
  hold-out.
- Eurostat only publishes each airport's main routes. A route-year that is missing is unpublished, not zero.
- 2023 has only 13 testable routes.
- Pretrained time-series models (Chronos, TimesFM) have not been run yet.

## Adding a model

A model is a function `f(route, T, ctx) -> array of 12 monthly forecasts` that may only read `Y[route][year]` for
years before `T`. Add it to the `MODELS` dictionary in `backtest.py`, run the script, and include the new row of
`scores.md` in your pull request. A model is worth switching to if it beats the baseline in all four test years.
