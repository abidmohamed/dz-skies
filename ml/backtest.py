"""Year-ahead forecast benchmark for monthly passengers on Algeria-Europe routes (Eurostat avia_par).

Protocol: standing at the end of year T-1, forecast the 12 months of year T for every route that
Eurostat published in full for both T-1 and T. All models are scored on the same route-months.

    python ml/backtest.py [monthly csv] [output folder]

Writes scores, per-month forecasts, the range check, the forward forecast and the totals the site draws.
"""
import sys, json, warnings, calendar, datetime as dt
from pathlib import Path
import numpy as np, pandas as pd
warnings.filterwarnings("ignore"); warnings.simplefilter("ignore")

ROOT = Path(__file__).resolve().parents[1]
SRC = sys.argv[1] if len(sys.argv) > 1 else ROOT / "data" / "eurostat_algeria_routes_monthly.csv"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "ml" / "results"
OUT.mkdir(parents=True, exist_ok=True)
TEST_YEARS = [2018, 2019, 2023, 2024]   # fixed: two normal years before COVID, the rebound year, one normal year after
COVID = {2020, 2021, 2022}          # never used as a training target; 2020-21 never used as the lag year
CLIP = (0.8, 1.25)                  # bounds on any growth factor carried into the next year

# ---------------- data ----------------
raw = pd.read_csv(SRC, dtype=str)
raw = raw[raw.tra_meas == "PAS_CRD"]
raw["v"] = pd.to_numeric(raw.OBS_VALUE, errors="coerce")
raw["year"] = raw.TIME_PERIOD.str[:4].astype(int)
raw["m"] = raw.TIME_PERIOD.str[5:7].astype(int)
Y = {}                               # route -> {year: array(12)} for fully published years only
for (r, y), g in raw.groupby(["airp_pr", "year"]):
    a = np.full(12, np.nan); a[g.m.values - 1] = g.v.values
    if not np.isnan(a).any(): Y.setdefault(r, {})[y] = a
routes = sorted(Y)
print(f"routes {len(routes)}, full route-years {sum(len(v) for v in Y.values())}")

# ---------------- calendar features: share of each month falling in Ramadan / the two Eid weeks ----------------
try:
    from hijridate import Hijri
    def _span(h_year, h_month, h_day, days):
        s = Hijri(h_year, h_month, h_day).to_gregorian(); s = dt.date(s.year, s.month, s.day)
        return [s + dt.timedelta(d) for d in range(days)]
    CAL = {}
    for hy in range(1420, 1450):
        eidf, eida = _span(hy, 10, 1, 7), _span(hy, 12, 8, 7)      # week after Ramadan; week around Eid al-Adha
        for name, days in (("ram", _span(hy, 9, 1, 29)), ("eidf", eidf), ("eida", eida), ("eid", eidf + eida)):
            for d in days:
                k = (name, d.year, d.month); CAL[k] = CAL.get(k, 0) + 1 / calendar.monthrange(d.year, d.month)[1]
except Exception as e:                # pragma: no cover
    print("no hijri calendar:", e); CAL = {}
cal = lambda name, y, m: CAL.get((name, y, m), 0.0)

# ---------------- baselines ----------------
def growth(r, T):
    """Route's own last annual growth, clipped; None when the two previous years are not both published or span COVID."""
    h = Y[r]
    if T - 1 in h and T - 2 in h and (T - 2) not in COVID: return float(np.clip(h[T - 1].sum() / h[T - 2].sum(), *CLIP))
    return None

def pooled_growth(T, rs):
    if (T - 2) in COVID: return 1.0
    a = [Y[r][T - 1].sum() for r in rs if T - 2 in Y[r]]; b = [Y[r][T - 2].sum() for r in rs if T - 2 in Y[r]]
    return float(np.clip(sum(a) / sum(b), *CLIP)) if b else 1.0

def m_sn(r, T, ctx): return Y[r][T - 1].copy()
def m_drift(r, T, ctx):
    g = growth(r, T); return Y[r][T - 1] * (g if g is not None else ctx["pg"])
def m_pooled(r, T, ctx): return Y[r][T - 1] * ctx["pg"]
def m_profile(r, T, ctx):
    """Annual total carried forward with the route's growth, spread over months by its average seasonal profile."""
    h = Y[r]; ys = [y for y in (T - 1, T - 2, T - 3) if y in h and (y not in COVID or y == T - 1)]
    prof = np.mean([h[y] / h[y].sum() for y in ys], axis=0)
    g = growth(r, T); return h[T - 1].sum() * (g if g is not None else ctx["pg"]) * prof
def m_ets(r, T, ctx):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    h = Y[r]; ys = []
    y = T - 1
    while y in h: ys.append(y); y -= 1
    if len(ys) < 3: return m_sn(r, T, ctx)
    s = np.concatenate([h[y] for y in sorted(ys)]) + 1.0
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            f = ExponentialSmoothing(s, trend="add", damped_trend=True, seasonal="mul", seasonal_periods=12).fit()
        p = np.asarray(f.forecast(12)) - 1.0
        return np.clip(p, 0, None) if np.isfinite(p).all() else m_sn(r, T, ctx)
    except Exception:
        return m_sn(r, T, ctx)

# ---------------- same month last year, corrected for where Ramadan and the two Eids fall ----------------
CAL_KEYS = ("ram", "eidf", "eida")
def cal_shift(y_to, y_from):
    """12 x 3 matrix: change in the share of each month covered by Ramadan / Eid weeks, centred over the year."""
    X = np.array([[cal(k, y_to, m) - cal(k, y_from, m) for k in CAL_KEYS] for m in range(1, 13)])
    return X - X.mean(0)

def usable(r, y, lag=1):
    return y in Y[r] and (y - lag) in Y[r] and y not in COVID and not ({y - k for k in range(1, lag + 1)} & {2020, 2021})

def fit_calendar(T, lag=1):
    """Pooled weighted least squares on within-year redistribution of traffic, using only years before T."""
    X, t, w = [], [], []
    for r in routes:
        for y in Y[r]:
            if y >= T or not usable(r, y, lag): continue
            d = np.log1p(Y[r][y]) - np.log1p(Y[r][y - lag])
            X.append(cal_shift(y, y - lag)); t.append(d - d.mean()); w.append(np.full(12, np.sqrt(Y[r][y].sum())))
    if not X: return np.zeros(len(CAL_KEYS))
    X, t, w = np.vstack(X), np.concatenate(t), np.sqrt(np.concatenate(w))
    return np.linalg.lstsq(X * w[:, None], t * w, rcond=None)[0]

def calendar_forecast(r, T, beta, lag=1):
    c = cal_shift(T, T - lag) @ beta
    return Y[r][T - lag] * np.exp(c - c.mean())

def m_calendar(r, T, ctx):
    if "beta" not in ctx: ctx["beta"] = fit_calendar(T)
    return calendar_forecast(r, T, ctx["beta"])

# ---------------- pooled gradient boosting on the log change vs the same month last year ----------------
CC = sorted({r[:2] for r in routes}); DZ = sorted({r[11:15] for r in routes})
def feats(r, y, calendar_feats):
    h = Y[r]; l1 = h[y - 1]; rows = []
    # growth measured across a COVID year says nothing about the next year, so those lags are treated as missing
    l2 = h.get(y - 2) if (y - 2) not in COVID else None
    l3 = h.get(y - 3) if (y - 3) not in COVID else None
    g1 = np.log(l1.sum() / l2.sum()) if l2 is not None else np.nan
    g2 = np.log(l2.sum() / l3.sum()) if l2 is not None and l3 is not None else np.nan
    for m in range(12):
        f = dict(month=m + 1, log_lag=np.log1p(l1[m]), log_tot=np.log(l1.sum()), share=l1[m] / l1.sum(), g1=g1, g2=g2,
                 d24=np.log1p(l1[m]) - np.log1p(l2[m]) if l2 is not None else np.nan,
                 age=sum(1 for k in h if k < y), cc=CC.index(r[:2]), dz=DZ.index(r[11:15]))
        if calendar_feats:
            f.update(ram=cal("ram", y, m + 1), ram_lag=cal("ram", y - 1, m + 1), eid=cal("eid", y, m + 1), eid_lag=cal("eid", y - 1, m + 1))
            f["d_ram"] = f["ram"] - f["ram_lag"]; f["d_eid"] = f["eid"] - f["eid_lag"]
        rows.append(f)
    return rows

def fit_gbm(T, calendar_feats):
    import lightgbm as lgb
    X, t = [], []
    for r in routes:
        for y in Y[r]:
            if y >= T or y in COVID or (y - 1) in {2020, 2021} or (y - 1) not in Y[r]: continue
            X += feats(r, y, calendar_feats); t += list(np.log1p(Y[r][y]) - np.log1p(Y[r][y - 1]))
    X = pd.DataFrame(X); t = np.array(t)
    models = [lgb.LGBMRegressor(n_estimators=400, learning_rate=0.03, num_leaves=7, min_child_samples=25, subsample=0.8, subsample_freq=1,
                                colsample_bytree=0.8, reg_lambda=5.0, random_state=s, verbose=-1, n_jobs=2).fit(X, t) for s in range(5)]
    return models, len(t)

def m_gbm(calendar_feats):
    def f(r, T, ctx):
        key = ("gbm", calendar_feats)
        if key not in ctx: ctx[key] = fit_gbm(T, calendar_feats)
        models, _ = ctx[key]
        X = pd.DataFrame(feats(r, T, calendar_feats))
        d = np.mean([m.predict(X) for m in models], axis=0)
        return np.clip(np.expm1(np.log1p(Y[r][T - 1]) + d), 0, None)
    return f

MODELS = {"same_month_last_year": m_sn, "last_year_calendar_corrected": m_calendar, "last_year_x_route_growth": m_drift, "last_year_x_pooled_growth": m_pooled,
          "seasonal_profile": m_profile, "holt_winters": m_ets, "gbm_pooled": m_gbm(False), "gbm_pooled_calendar": m_gbm(True)}

# ---------------- run ----------------
rows, preds = [], []
for T in TEST_YEARS:
    rs = [r for r in routes if T in Y[r] and T - 1 in Y[r]]
    ctx = {"pg": pooled_growth(T, rs)}
    act = np.array([Y[r][T] for r in rs])
    out = {name: np.array([f(r, T, ctx) for r in rs]) for name, f in MODELS.items()}
    base = np.abs(out["same_month_last_year"] - act).mean()
    for name, p in out.items():
        e = np.abs(p - act)
        rows.append(dict(test_year=T, model=name, routes=len(rs), route_months=act.size, passengers=int(act.sum()),
                         wape=e.sum() / act.sum(), rel_mae=e.mean() / base,
                         median_route_wape=float(np.median(e.sum(1) / act.sum(1))),
                         annual_total_err=float(np.median(np.abs(p.sum(1) - act.sum(1)) / act.sum(1))),
                         network_total_err=float((p.sum() - act.sum()) / act.sum())))
        for i, r in enumerate(rs):
            for m in range(12): preds.append((T, r, m + 1, name, float(act[i, m]), float(p[i, m])))
    print(T, "routes", len(rs), "pooled growth used", round(ctx["pg"], 3), "gbm train rows", ctx[("gbm", False)][1],
          "calendar effects (log change per full month of Ramadan / Eid al-Fitr week / Eid al-Adha week):", np.round(ctx["beta"], 3))
res = pd.DataFrame(rows)
res.to_csv(f"{OUT}/backtest_scores.csv", index=False)
pd.DataFrame(preds, columns=["test_year", "route", "month", "model", "actual", "forecast"]).to_csv(f"{OUT}/backtest_forecasts.csv", index=False)
LABEL = {"same_month_last_year": "Same month last year (baseline)", "last_year_calendar_corrected": "Baseline + Ramadan/Eid correction",
         "last_year_x_route_growth": "Baseline x route's last growth", "last_year_x_pooled_growth": "Baseline x network growth",
         "seasonal_profile": "Annual total x seasonal profile", "holt_winters": "Holt-Winters per route",
         "gbm_pooled": "Gradient boosting, pooled", "gbm_pooled_calendar": "Gradient boosting + calendar features"}
piv = res.pivot(index="model", columns="test_year", values="wape").reindex(MODELS)
n = res.drop_duplicates("test_year").set_index("test_year").routes
md = ["| Model | " + " | ".join(str(y) for y in TEST_YEARS) + " |", "|---|" + "---|" * len(TEST_YEARS)]
md += [f"| {LABEL[m]} | " + " | ".join(f"{piv.loc[m, y] * 100:.1f}%" for y in TEST_YEARS) + " |" for m in MODELS]
md += ["| Routes tested | " + " | ".join(str(n[y]) for y in TEST_YEARS) + " |"]
(OUT / "scores.md").write_text("\n".join(md) + "\n", encoding="utf-8")
pd.set_option("display.width", 220)
for col, k in (("wape", 100), ("rel_mae", 1), ("median_route_wape", 100), ("network_total_err", 100)):
    print("\n" + col); print(res.pivot(index="model", columns="test_year", values=col).mul(k).round(2).reindex(MODELS).to_string())

# ---------------- uncertainty ranges from past forecast errors, then the forward forecast ----------------
def past_errors(T, lag):
    """log(actual / forecast) for every usable year before T, each forecast made only with data before that year."""
    errs = []
    first = min(y for r in routes for y in Y[r]) + 4 + lag
    for y in range(first, T):
        if y in COVID or ({y - k for k in range(1, lag + 1)} & {2020, 2021}): continue
        rs = [r for r in routes if usable(r, y, lag)]
        if not rs: continue
        b = fit_calendar(y - lag + 1, lag) if lag > 1 else fit_calendar(y)
        for r in rs: errs.append(np.log1p(Y[r][y]) - np.log1p(calendar_forecast(r, y, b, lag)))
    return np.concatenate(errs) if errs else np.array([0.0])

cov = []
for T in TEST_YEARS:
    rs = [r for r in routes if T in Y[r] and T - 1 in Y[r]]
    lo, hi = np.quantile(past_errors(T, 1), [0.1, 0.9]); b = fit_calendar(T)
    P = np.array([calendar_forecast(r, T, b) for r in rs]); A = np.array([Y[r][T] for r in rs])
    inside = (A >= P * np.exp(lo)) & (A <= P * np.exp(hi))
    cov.append(dict(test_year=T, low_factor=round(float(np.exp(lo)), 3), high_factor=round(float(np.exp(hi)), 3), coverage_of_80pct_range=round(float(inside.mean()), 3)))
cov = pd.DataFrame(cov); cov.to_csv(f"{OUT}/interval_coverage.csv", index=False)
print("\n80% range check"); print(cov.to_string(index=False))

LAST = max(y for r in routes for y in Y[r])
fwd = []
for lag, T in ((1, LAST + 1), (2, LAST + 2)):
    b = fit_calendar(LAST + 1, lag); lo, hi = np.quantile(past_errors(LAST + 1, lag), [0.1, 0.9])
    for r in routes:
        if LAST not in Y[r]: continue
        p = calendar_forecast(r, T, b, lag)
        for m in range(12): fwd.append((r, f"{T}-{m + 1:02d}", round(float(p[m])), round(float(p[m] * np.exp(lo))), round(float(p[m] * np.exp(hi)))))
    print(f"forward {T}: effects {np.round(b, 3)}, 80% range x{np.exp(lo):.2f} to x{np.exp(hi):.2f}")
fwd = pd.DataFrame(fwd, columns=["route", "month", "forecast", "low80", "high80"])
fwd.to_csv(f"{OUT}/forecast_next_two_years.csv", index=False)
print(fwd.assign(year=fwd.month.str[:4]).groupby("year")[["forecast", "low80", "high80"]].sum().to_string(), "| routes", fwd.route.nunique())

# ---------------- network and airport totals for the site: history, forecast and ranges at that level ----------------
def groups_of(r): return ("*", r[11:15], r[3:7])     # whole network, Algerian airport (ICAO), European airport (ICAO)

def group_errors(T, lag):
    """Past log(actual / forecast) of summed forecasts, for the network and pooled over airports."""
    net, ap = [], []
    first = min(y for r in routes for y in Y[r]) + 4 + lag
    for y in range(first, T):
        if y in COVID or ({y - k for k in range(1, lag + 1)} & {2020, 2021}): continue
        rs = [r for r in routes if usable(r, y, lag)]
        if not rs: continue
        b = fit_calendar(y - lag + 1, lag)
        agg = {}
        for r in rs:
            f = calendar_forecast(r, y, b, lag)
            for g in groups_of(r):
                a = agg.setdefault(g, [np.zeros(12), np.zeros(12)]); a[0] += Y[r][y]; a[1] += f
        for g, (a, f) in agg.items(): (net if g == "*" else ap).append(np.log1p(a) - np.log1p(f))
    return np.concatenate(net), np.concatenate(ap)

fc_routes = [r for r in routes if LAST in Y[r]]
G = {}
for r in fc_routes:
    for g in groups_of(r):
        d = G.setdefault(g, dict(act=np.zeros(24), n=[0, 0], fc=np.zeros(24), lo=None, hi=None))
        d["act"][12:] += Y[r][LAST]; d["n"][1] += 1
        if LAST - 1 in Y[r]: d["act"][:12] += Y[r][LAST - 1]; d["n"][0] += 1
ranges = {}
for lag in (1, 2):
    b = fit_calendar(LAST + 1, lag); net, ap = group_errors(LAST + 1, lag)
    ranges[lag] = {"*": np.exp(np.quantile(net, [0.1, 0.9])), "ap": np.exp(np.quantile(ap, [0.1, 0.9]))}
    for r in fc_routes:
        f = calendar_forecast(r, LAST + lag, b, lag)
        for g in groups_of(r): G[g]["fc"][(lag - 1) * 12:lag * 12] += f
    print(f"range factors, {lag} year(s) ahead: network x{ranges[lag]['*'][0]:.2f}-x{ranges[lag]['*'][1]:.2f} (n={net.size}), airports x{ranges[lag]['ap'][0]:.2f}-x{ranges[lag]['ap'][1]:.2f} (n={ap.size})")
out = {"last": LAST, "groups": {}, "calendar_effects": dict(zip(CAL_KEYS, np.round(fit_calendar(LAST + 1), 3).tolist()))}
for g, d in G.items():
    k = "*" if g == "*" else "ap"
    lo = np.concatenate([d["fc"][:12] * ranges[1][k][0], d["fc"][12:] * ranges[2][k][0]]); hi = np.concatenate([d["fc"][:12] * ranges[1][k][1], d["fc"][12:] * ranges[2][k][1]])
    out["groups"][g] = dict(n=d["n"], act=[None if d["n"][0] == 0 and i < 12 else int(round(v)) for i, v in enumerate(d["act"])],
                            fc=[int(round(v)) for v in d["fc"]], lo=[int(round(v)) for v in lo], hi=[int(round(v)) for v in hi])
json.dump(out, open(f"{OUT}/forecast_groups.json", "w"))
print("groups:", len(G), "| network", LAST, "actual", int(G["*"]["act"][12:].sum()), "| forecast", LAST + 1, int(G["*"]["fc"][:12].sum()), "|", LAST + 2, int(G["*"]["fc"][12:].sum()))
