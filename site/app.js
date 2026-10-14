/* dz-skies: map of Algerian airports, listed routes and Eurostat traffic. Data comes from data.json, built by the pipeline. */
function start(DATA, WORLD) {
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const YEARS = Object.keys(DATA.years);
const AP = new Map(DATA.airports.map(a => [a.id, a]));
const FX = DATA.foreign, CAR = DATA.carriers;
const TYPE_NAME = { L: 'Large airport', M: 'Medium airport', S: 'Small airfield', H: 'Heliport' };
const ALG = [3.2154, 36.691];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- data ---------- */
const R = {}, LISTED = new Map();
for (const y of YEARS) {
  R[y] = [];
  for (const k of ['intl', 'dom']) for (const [a, b, c, km, min] of DATA.years[y][k]) {
    const key = a + '-' + b;
    R[y].push({ a, b, c, km, min, k, key });
    if (!LISTED.has(key)) LISTED.set(key, []);
    LISTED.get(key).push(y);
  }
}
function place(code) {
  const a = AP.get(code);
  if (a) return { code, label: a.iata || a.icao, city: a.city || a.name, name: a.name, country: 'Algeria', dz: true, lon: a.lon, lat: a.lat };
  const f = FX[code];
  return { code, label: code, city: f.city || f.name, name: f.name, country: f.country, dz: false, lon: f.lon, lat: f.lat };
}
const ES = DATA.es, EY = d3.range(ES.y0, ES.y1 + 1), NY = EY.length;
const EP = ES.pairs.map(p => Object.assign({ key: p.a + '-' + p.b }, p));
const MEAS = { P: ['Passengers', 'passengers'], C: ['Flights', 'flights'], S: ['Seats', 'seats'] };
const state = { mode: 'routes', year: YEARS[YEARS.length - 1], py: ES.y1, meas: 'P', type: 'all', carrier: '', sel: null, idle: true, sort: { col: 'from', dir: 1 }, psort: { col: 'P', dir: -1 }, q: '' };
const pax = () => state.mode === 'pax';
function paxRoutes(y, m = state.meas) { const i = y - ES.y0; return EP.filter(p => p[m][i] != null).map(p => ({ a: p.a, b: p.b, k: 'intl', key: p.key, c: [], km: p.km, min: null, v: p[m][i], P: p.P[i], S: p.S[i], C: p.C[i], p })); }
const match = r => (state.type === 'all' || r.k === state.type) && (!state.carrier || r.c.includes(state.carrier));
const visible = (y = state.year) => R[y].filter(match);
function degrees(rs) {
  const d = new Map();
  const bump = (code, k, v) => { if (!d.has(code)) d.set(code, { dom: 0, intl: 0, n: 0, w: 0 }); const o = d.get(code); o[k]++; o.n++; o.w += v || 0; };
  for (const r of rs) { bump(r.a, r.k, r.v); bump(r.b, r.k, r.v); }
  return d;
}
let MAXDEG = 1;
for (const y of YEARS) for (const v of degrees(R[y]).values()) MAXDEG = Math.max(MAXDEG, v.n);
const EMAX = {}, EAMAX = {};
for (const m of 'PSC') { EMAX[m] = d3.max(EP, p => d3.max(p[m])); let mx = 0; for (const y of EY) for (const v of degrees(paxRoutes(y, m)).values()) mx = Math.max(mx, v.w); EAMAX[m] = mx; }
const wScale = v => 0.9 + 9 * v / EMAX[state.meas];
const rPax = w => 3 + 12 * Math.sqrt(w / EAMAX[state.meas]);
const fmtInt = v => v == null ? '–' : Math.round(v).toLocaleString('en-US').replace(/,/g, '\u202f');
const fmtBig = v => v == null ? '–' : v >= 1e6 ? (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + ' M' : v >= 1e4 ? Math.round(v / 1e3) + ' k' : fmtInt(v);
const pct = (a, b) => a != null && b ? Math.round(a / b * 100) + '%' : '–';
const other = (r, code) => r.a === code ? r.b : r.a;
const fmtMin = m => m ? Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') : '';
const fmtKm = k => k.toLocaleString('en-US').replace(/,/g, ' ') + ' km';
const carriers = r => r.c.map(c => CAR[c] || c).join(', ');
function dms(v, pos, neg, w) {
  const s = Math.round(Math.abs(v) * 3600), d = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return String(d).padStart(w, '0') + '°' + String(m).padStart(2, '0') + '′' + String(ss).padStart(2, '0') + '″' + (v >= 0 ? pos : neg);
}
const dots = key => {
  const ys = LISTED.get(key) || [];
  return '<span class="dots" title="Listed in ' + ys.join(', ') + '">' + YEARS.map(y => '<i class="' + (ys.includes(y) ? 'y' : '') + (y === state.year ? ' cur' : '') + '"></i>').join('') + '</span>';
};

/* ---------- tooltip ---------- */
const tipEl = $('#tip');
function tip(html, e) {
  if (!html) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html; tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + w > innerWidth - 8) x = e.clientX - w - 12;
  if (y + h > innerHeight - 8) y = e.clientY - h - 12;
  tipEl.style.left = Math.max(6, x) + 'px'; tipEl.style.top = Math.max(6, y) + 'px';
}
function routeTip(r) {
  const a = place(r.a), b = place(r.b), ys = LISTED.get(r.key);
  if (pax()) return '<b>' + a.label + ' – ' + b.label + '</b><br>' + esc(a.city) + ' – ' + esc(b.city) + ', ' + esc(b.country) +
    '<br><span>' + state.py + ': ' + fmtInt(r.P) + ' passengers · ' + fmtInt(r.C) + ' flights</span><br><span>' + fmtInt(r.S) + ' seats · ' + pct(r.P, r.S) + ' filled</span>';
  return '<b>' + a.label + ' – ' + b.label + '</b><br>' + esc(a.city) + ' – ' + esc(b.city) + (b.dz ? '' : ', ' + esc(b.country)) +
    '<br><span>' + esc(carriers(r)) + '</span><br><span>' + fmtKm(r.km) + (r.min ? ' · ' + fmtMin(r.min) : '') + '</span><br><span>Listed in ' + ys.join(', ') + '</span>';
}

/* ---------- map ---------- */
const wrap = $('#mapwrap'), svg = d3.select('#map');
const countries = topojson.feature(WORLD, WORLD.objects.countries);
const DZ = countries.features.find(f => f.id === '012');
const REST = { type: 'FeatureCollection', features: countries.features.filter(f => f.id !== '012') };
const proj = d3.geoAzimuthalEquidistant().rotate([-ALG[0], -ALG[1]]).clipAngle(128).precision(0.4);
const path = d3.geoPath(proj);
const gZ = svg.append('g');
const pSphere = gZ.append('path').attr('class', 'sphere');
const pLand = gZ.append('path').attr('class', 'land');
const pDz = gZ.append('path').attr('class', 'dz');
const gRings = gZ.append('g'), gRLab = gZ.append('g').attr('class', 'rlab');
const gRoutes = gZ.append('g'), gHits = gZ.append('g'), gFx = gZ.append('g'), gAp = gZ.append('g');
const RINGS = [500, 1000, 2000, 4000, 8000];
const circle = km => d3.geoCircle().center(ALG).radius(km / 6371 * 180 / Math.PI).precision(1)();
function destPoint(km, brg) {
  const d = km / 6371, t = brg * Math.PI / 180, p1 = ALG[1] * Math.PI / 180, l1 = ALG[0] * Math.PI / 180;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 * 180 / Math.PI, p2 * 180 / Math.PI];
}
gRings.selectAll('path').data(RINGS).join('path').attr('class', 'rng');
gRLab.selectAll('g').data(RINGS).join('g').append('text').text(d => fmtKm(d));
const rScale = d3.scaleSqrt().domain([1, MAXDEG]).range([3.6, 13]);
let W = 800, H = 600, T = d3.zoomIdentity, XY = new Map(), raf = 0;

const zoom = d3.zoom().scaleExtent([0.04, 16]).on('zoom', e => {
  T = e.transform; gZ.attr('transform', T);
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; rescale(); });
});
svg.call(zoom).on('dblclick.zoom', null);
svg.on('click', e => { if (e.target === svg.node() || e.target.classList.contains('sphere') || e.target.classList.contains('land') || e.target.classList.contains('dz')) select(null); });

function layout() {
  W = wrap.clientWidth || 800; H = wrap.clientHeight || 600;
  svg.attr('viewBox', '0 0 ' + W + ' ' + H);
  const pad = Math.min(W, H) * 0.06;
  proj.fitExtent([[pad, pad + 20], [W - pad, H - pad]], DZ);
  pSphere.attr('d', path({ type: 'Sphere' })); pLand.attr('d', path(REST)); pDz.attr('d', path(DZ));
  gRings.selectAll('path').attr('d', d => path(circle(d)));
  XY = new Map();
  for (const a of DATA.airports) XY.set(a.id, proj([a.lon, a.lat]));
  for (const k in FX) XY.set(k, proj([FX[k].lon, FX[k].lat]));
  gRLab.selectAll('g').each(function (d) { this.__xy = proj(destPoint(d, 300)); });
  drawMap();
}
const mkT = xy => 'translate(' + xy[0] + ',' + xy[1] + ') scale(' + 1 / T.k + ')';
function rescale() {
  gAp.selectAll('g.mk').attr('transform', d => mkT(XY.get(d.id)));
  gFx.selectAll('g.mk').attr('transform', d => mkT(XY.get(d)));
  gRLab.selectAll('g').attr('transform', function () { return mkT(this.__xy); });
  placeLabels();
}
let DEG = new Map(), VIS = [], NEI = new Set();
function drawMap() {
  VIS = pax() ? paxRoutes(state.py) : visible(); DEG = degrees(VIS);
  const unit = MEAS[state.meas][1];
  const sel = state.sel;
  NEI = new Set(sel ? VIS.filter(r => r.a === sel || r.b === sel).map(r => other(r, sel)) : []);
  const on = r => sel && (r.a === sel || r.b === sel);
  const line = r => { const a = place(r.a), b = place(r.b); return path({ type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }); };
  svg.classed('has-sel', !!sel).classed('pax', pax());
  gRoutes.selectAll('path').data(VIS, d => d.key).join('path').attr('class', d => 'route ' + d.k + (on(d) ? ' on' : '')).attr('d', line).style('stroke-width', d => pax() ? wScale(d.v) + 'px' : null);
  gHits.selectAll('path').data(VIS, d => d.key).join('path').attr('class', d => 'hit' + (on(d) ? ' on' : '')).attr('d', line)
    .on('pointermove', (e, d) => { hov(d.key, true); tip(routeTip(d), e); })
    .on('pointerleave', (e, d) => { hov(d.key, false); tip(null); })
    .on('click', (e, d) => { e.stopPropagation(); if (!sel) select(d.a); });
  // Algerian airports
  const aps = DATA.airports.filter(a => DEG.has(a.id) || state.idle || a.id === sel)
    .sort((p, q) => (DEG.get(q.id)?.n || 0) - (DEG.get(p.id)?.n || 0)).reverse();
  gAp.selectAll('g.mk').data(aps, d => d.id).join(en => {
    const g = en.append('g').attr('tabindex', 0).attr('role', 'button');
    g.each(function (d) { d3.select(this).append(d.t === 'H' ? 'rect' : 'circle'); });
    g.append('text').text(d => d.iata || d.icao);
    return g;
  }).attr('class', d => 'mk ap ' + (DEG.has(d.id) ? 'served' : 'idle') + (d.id === sel ? ' selected' : '') + (NEI.has(d.id) ? ' on' : ''))
    .attr('aria-label', d => (d.iata || d.icao) + ', ' + d.name + ', ' + (pax() ? fmtInt(DEG.get(d.id)?.w || 0) + ' ' + unit + ' in ' + state.py : (DEG.get(d.id)?.n || 0) + ' destinations in ' + state.year))
    .each(function (d) {
      const g = DEG.get(d.id), n = g?.n || 0, r = n ? (pax() ? rPax(g.w) : rScale(n)) : 2.6; d.r = r;
      const s = d3.select(this).select('circle,rect');
      if (d.t === 'H') s.attr('x', -2.6).attr('y', -2.6).attr('width', 5.2).attr('height', 5.2).attr('transform', 'rotate(45)');
      else s.attr('r', r);
    })
    .on('click', (e, d) => { e.stopPropagation(); select(d.id); })
    .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(d.id); } })
    .on('pointermove', (e, d) => { const g = DEG.get(d.id); tip('<b>' + (d.iata || d.icao) + '</b> ' + esc(d.name) + '<br><span>' + esc(d.city || '') + (pax() ? (g ? ' · ' + fmtInt(g.w) + ' ' + unit + ' on ' + g.n + ' route' + (g.n > 1 ? 's' : '') + ' in ' + state.py : ' · no Eurostat figure for ' + state.py) : g ? ' · ' + g.dom + ' domestic, ' + g.intl + ' international' : ' · no flights listed in ' + state.year) + '</span>', e); })
    .on('pointerleave', () => tip(null));
  // foreign endpoints
  const fx = [...DEG.keys()].filter(k => !AP.has(k));
  gFx.selectAll('g.mk').data(fx, d => d).join(en => {
    const g = en.append('g'); g.append('circle'); g.append('text').text(d => d); return g;
  }).attr('class', d => 'mk fx' + (d === sel ? ' selected' : '') + (NEI.has(d) ? ' on' : ''))
    .each(function (d) { const r = Math.max(d === sel ? 5 : 2.6, pax() ? rPax(DEG.get(d).w) * 0.75 : 0); this.__r = r; d3.select(this).select('circle').attr('r', r); })
    .on('click', (e, d) => { e.stopPropagation(); select(d); })
    .on('pointermove', (e, d) => { const f = FX[d]; tip('<b>' + d + '</b> ' + esc(f.name) + '<br><span>' + esc(f.city) + ', ' + esc(f.country) + ' · ' + (pax() ? fmtInt(DEG.get(d).w) + ' ' + unit + ' in ' + state.py : DEG.get(d).n + ' Algerian airport' + (DEG.get(d).n > 1 ? 's' : '')) + '</span>', e); })
    .on('pointerleave', () => tip(null));
  rescale();
  const n = { dom: VIS.filter(r => r.k === 'dom').length, intl: VIS.filter(r => r.k === 'intl').length };
  $('#badge').innerHTML = pax() ? '<b>' + state.py + '</b><span>' + fmtBig(d3.sum(VIS, r => r.v)) + ' ' + unit + ' · ' + VIS.length + ' Europe route' + (VIS.length === 1 ? '' : 's') + '</span>'
    : '<b>' + state.year + '</b><span>' + n.dom + ' domestic · ' + n.intl + ' international' + (state.carrier ? ' · ' + esc(CAR[state.carrier]) : '') + '</span>';
  const ln = (c, w) => '<svg width="22" height="10"><line x1="2" y1="5" x2="20" y2="5" stroke="var(--' + c + ')" stroke-width="' + w + '" stroke-linecap="round"/></svg>';
  const dotL = '<svg width="22" height="14"><circle cx="5" cy="7" r="3" fill="var(--ink)"/><circle cx="15" cy="7" r="6" fill="var(--ink)"/></svg>';
  const idleL = '<svg width="22" height="14"><circle cx="5" cy="7" r="2.6" fill="var(--land-dz)" stroke="var(--ink3)" stroke-width="1.2"/><rect x="12.5" y="4.5" width="5" height="5" transform="rotate(45 15 7)" fill="var(--land-dz)" stroke="var(--ink3)" stroke-width="1.2"/></svg>';
  const ringL = '<div class="opt"><svg width="22" height="14"><path d="M2 13 A 12 12 0 0 1 20 13" fill="none" stroke="var(--ring)" stroke-width="1.2"/></svg>Distance from Algiers</div>';
  $('#legend').innerHTML = pax()
    ? '<div>' + ln('intl', 1.5) + ln('intl', 6) + 'Route, width by ' + unit + '</div><div>' + dotL + 'Airport, sized by ' + unit + '</div><div class="opt">' + idleL + 'No Eurostat figure · heliport</div>' + ringL
    : '<div>' + ln('dom', 2.5) + 'Domestic route</div><div>' + ln('intl', 2.5) + 'International route</div><div>' + dotL + 'Airport, sized by destinations</div><div class="opt">' + idleL + 'No listed flights · heliport</div>' + ringL;
}
function hov(key, on) { gRoutes.selectAll('path').filter(d => d.key === key).classed('hov', on).raise(); }
function placeLabels() {
  const sel = state.sel, cand = [];
  gAp.selectAll('g.mk').each(function (d) {
    const n = DEG.get(d.id)?.n || 0;
    let p = -1;
    if (d.id === sel) p = 1e6; else if (sel) p = NEI.has(d.id) ? 1e4 + n : -1; else if (n) p = 1e3 + n;
    cand.push({ el: this, id: d.id, r: d.r || 3, p, txt: d.iata || d.icao });
  });
  gFx.selectAll('g.mk').each(function (d) {
    let p = d === sel ? 1e6 : sel ? (NEI.has(d) ? 5e3 + DEG.get(d).n : -1) : DEG.get(d).n;
    cand.push({ el: this, id: d, r: this.__r || 2.6, p, txt: d });
  });
  cand.sort((a, b) => b.p - a.p);
  const boxes = [];
  const free = b => !boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
  for (const c of cand) {
    const t = c.el.lastChild, xy = XY.get(c.id);
    const x = T.applyX(xy[0]), y = T.applyY(xy[1]);
    if (c.p < 0 || x < -20 || x > W + 20 || y < -20 || y > H + 20) { t.setAttribute('hidden', ''); continue; }
    const w = c.txt.length * 6.7 + 2, right = [x + c.r + 3, y - 6.5, x + c.r + 3 + w, y + 6.5], left = [x - c.r - 3 - w, y - 6.5, x - c.r - 3, y + 6.5];
    boxes.push([x - c.r, y - c.r, x + c.r, y + c.r]);
    if (free(right)) { boxes.push(right); t.removeAttribute('hidden'); t.setAttribute('x', c.r + 3); t.setAttribute('text-anchor', 'start'); }
    else if (free(left)) { boxes.push(left); t.removeAttribute('hidden'); t.setAttribute('x', -c.r - 3); t.setAttribute('text-anchor', 'end'); }
    else t.setAttribute('hidden', '');
  }
}
function go(t) { (reduce ? svg : svg.transition().duration(550)).call(zoom.transform, t); }
function fit(codes, maxK = 7) {
  const pts = codes.map(c => XY.get(c)).filter(Boolean);
  if (!pts.length) return;
  const x0 = d3.min(pts, p => p[0]), x1 = d3.max(pts, p => p[0]), y0 = d3.min(pts, p => p[1]), y1 = d3.max(pts, p => p[1]);
  const pad = Math.min(W, H) * 0.12;
  const k = Math.min(maxK, (W - 2 * pad) / Math.max(x1 - x0, 1), (H - 2 * pad) / Math.max(y1 - y0, 1));
  go(d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k));
}
function fitRoutes(rs, cap) {
  if (cap && rs.length > 4) { const q = d3.quantile(rs.map(r => r.km).sort(d3.ascending), 0.85); const lim = Math.max(1500, q * 1.4); rs = rs.filter(r => r.km <= lim); }
  fit([...new Set(rs.flatMap(r => [r.a, r.b]))]);
}
$('#zin').onclick = () => (reduce ? svg : svg.transition().duration(250)).call(zoom.scaleBy, 1.6);
$('#zout').onclick = () => (reduce ? svg : svg.transition().duration(250)).call(zoom.scaleBy, 1 / 1.6);
$('#vdz').onclick = () => go(d3.zoomIdentity);
$('#vall').onclick = () => { const rs = state.sel ? VIS.filter(r => r.a === state.sel || r.b === state.sel) : VIS; rs.length ? fitRoutes(rs, false) : go(d3.zoomIdentity); };

/* ---------- charts ---------- */
const SLOT = [0, 1.55, 2.55, 3.55, 4.55, 5.85];
function colTop(x, y, w, h, r) { r = Math.min(r, h, w / 2); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + -r + 'H' + (x + w - r) + 'a' + r + ',' + r + ' 0 0 1 ' + r + ',' + r + 'V' + (y + h) + 'Z'; }
function yearChart(rows) {
  const w = 352, h = 138, top = 18, bot = 24, left = 20, bw = 22, ih = h - top - bot;
  const step = (w - left * 2 - bw) / SLOT[SLOT.length - 1];
  const max = Math.max(1, d3.max(rows, r => r.dom + r.intl));
  const sy = v => v / max * ih;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="group" aria-label="Routes listed per snapshot year">';
  s += '<line class="base" x1="0" x2="' + w + '" y1="' + (h - bot + .5) + '" y2="' + (h - bot + .5) + '"/>';
  rows.forEach((r, i) => {
    const x = left + SLOT[i] * step, tot = r.dom + r.intl, hd = sy(r.dom), hi = sy(r.intl), gap = r.dom && r.intl ? 2 : 0;
    const yb = h - bot;
    s += '<g class="col' + (r.y === state.year ? ' cur' : '') + '" data-y="' + r.y + '" tabindex="0" role="button" aria-label="' + r.y + ': ' + r.dom + ' domestic, ' + r.intl + ' international. Show this year.">';
    s += '<rect class="hitbox" x="' + (x - 8) + '" y="0" width="' + (bw + 16) + '" height="' + h + '" rx="3"/>';
    if (r.dom) s += r.intl ? '<rect class="dom" x="' + x + '" y="' + (yb - hd) + '" width="' + bw + '" height="' + hd + '"/>' : '<path class="dom" d="' + colTop(x, yb - hd, bw, hd, 4) + '"/>';
    if (r.intl) s += '<path class="intl" d="' + colTop(x, yb - hd - gap - hi, bw, hi, 4) + '"/>';
    s += '<text class="tot" x="' + (x + bw / 2) + '" y="' + (yb - hd - gap - hi - 5) + '">' + tot + '</text>';
    s += '<text x="' + (x + bw / 2) + '" y="' + (h - 8) + '">' + r.y + '</text>';
    if (r.y === state.year) s += '<rect class="curmark" x="' + x + '" y="' + (h - 3) + '" width="' + bw + '" height="2"/>';
    s += '</g>';
  });
  s += '<text x="' + (left + (SLOT[0] + SLOT[1]) / 2 * step + bw / 2) + '" y="' + (h - 8) + '">···</text>';
  return s + '</svg>';
}
function bindChart(el) {
  el.querySelectorAll('.col, .ycol').forEach(g => {
    const y = g.dataset.y, set = () => g.classList.contains('ycol') ? setPY(y) : setYear(y);
    g.addEventListener('click', set);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(); } });
    g.addEventListener('pointermove', e => tip(g.getAttribute('aria-label').replace(' Show this year.', ''), e));
    g.addEventListener('pointerleave', () => tip(null));
  });
}
function totalsChart(rows) {
  const w = 352, h = 152, top = 20, bot = 20, band = w / NY, bw = band - 2.5, ih = h - top - bot, unit = MEAS[state.meas][1];
  const max = Math.max(1, d3.max(rows, r => r.v || 0)), sy = v => v / max * ih, yb = h - bot;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="group" aria-label="' + MEAS[state.meas][0] + ' per year, ' + ES.y0 + ' to ' + ES.y1 + '">';
  for (const t of d3.ticks(0, max, 3).filter(t => t > 0 && sy(t) < ih - 4)) s += '<line class="grid" x1="0" x2="' + w + '" y1="' + (yb - sy(t) + .5) + '" y2="' + (yb - sy(t) + .5) + '"/><text class="ax" x="0" y="' + (yb - sy(t) - 3) + '">' + (t >= 1e6 ? t / 1e6 + ' M' : t >= 1e3 ? t / 1e3 + ' k' : t) + '</text>';
  s += '<line class="base" x1="0" x2="' + w + '" y1="' + (yb + .5) + '" y2="' + (yb + .5) + '"/>';
  rows.forEach((r, i) => {
    const x = i * band + 1.25, cur = r.y === state.py;
    s += '<g class="ycol' + (cur ? ' cur' : '') + '" data-y="' + r.y + '" tabindex="0" role="button" aria-label="' + r.y + ': ' + (r.v == null ? 'no figure' : fmtInt(r.v) + ' ' + unit + ' on ' + r.n + ' route' + (r.n === 1 ? '' : 's')) + '. Show this year.">';
    s += '<rect class="hitbox" x="' + (i * band) + '" y="' + (top - 4) + '" width="' + band + '" height="' + (h - top + 4) + '"/>';
    if (r.v) s += '<path class="v" d="' + colTop(x, yb - Math.max(1.5, sy(r.v)), bw, Math.max(1.5, sy(r.v)), 2) + '"/>';
    if (cur) s += '<rect class="curmark" x="' + x + '" y="' + (yb + 2) + '" width="' + bw + '" height="2"/>';
    if (r.y % 5 === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (h - 5) + '">' + r.y + '</text>';
    s += '</g>';
  });
  const c = rows.find(r => r.y === state.py);
  s += '<text class="tot" x="' + w + '" y="11" style="text-anchor:end;font-weight:700">' + state.py + ' · ' + (c.v == null ? 'no figure' : fmtBig(c.v) + ' ' + unit) + '</text>';
  return s + '</svg>';
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function forecastSection(code) {
  const F = ES.fc, g = F && F.g[code || '*'];
  if (!g) return '';
  const w = 352, h = 170, top = 22, bot = 22, n = 48, ih = h - top - bot, yb = h - bot, y0 = F.last - 1;
  const vals = g.act.concat(g.fc), max = Math.max(1, d3.max(g.hi.concat(g.act.map(v => v || 0)))), x = i => 4 + i * (w - 8) / (n - 1), y = v => yb - v / max * ih;
  let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="group" aria-label="Monthly passengers, ' + y0 + ' to ' + F.last + ', and forecast for ' + (F.last + 1) + ' and ' + (F.last + 2) + '">';
  for (const t of d3.ticks(0, max, 3).filter(t => t > 0)) s += '<line class="grid" x1="0" x2="' + w + '" y1="' + (y(t) + .5) + '" y2="' + (y(t) + .5) + '"/><text class="ax" x="0" y="' + (y(t) - 3) + '">' + (t >= 1e6 ? t / 1e6 + ' M' : t >= 1e3 ? t / 1e3 + ' k' : t) + '</text>';
  s += '<line class="base" x1="0" x2="' + w + '" y1="' + (yb + .5) + '" y2="' + (yb + .5) + '"/>';
  const xd = (x(23) + x(24)) / 2;
  s += '<line class="fdiv" x1="' + xd + '" x2="' + xd + '" y1="' + (top - 10) + '" y2="' + yb + '"/><text class="lbl" x="' + (xd - 5) + '" y="' + (top - 12) + '" style="text-anchor:end">reported</text><text class="lbl" x="' + (xd + 5) + '" y="' + (top - 12) + '" style="text-anchor:start">forecast</text>';
  s += '<path class="fband" d="M' + g.hi.map((v, i) => x(24 + i).toFixed(1) + ',' + y(v).toFixed(1)).join('L') + 'L' + g.lo.map((v, i) => x(24 + i).toFixed(1) + ',' + y(v).toFixed(1)).reverse().join('L') + 'Z"/>';
  const a0 = g.act[0] == null ? 12 : 0;
  s += '<path class="fline" d="M' + g.act.slice(a0).map((v, i) => x(a0 + i).toFixed(1) + ',' + y(v).toFixed(1)).join('L') + '"/>';
  s += '<path class="fline fc" d="M' + x(23).toFixed(1) + ',' + y(g.act[23]).toFixed(1) + 'L' + g.fc.map((v, i) => x(24 + i).toFixed(1) + ',' + y(v).toFixed(1)).join('L') + '"/>';
  for (let k = 0; k < 4; k++) s += '<text x="' + ((x(k * 12) + x(k * 12 + 11)) / 2) + '" y="' + (h - 6) + '">' + (y0 + k) + '</text>';
  for (let i = 0; i < n; i++) {
    if (vals[i] == null) continue;
    const lab = MON[i % 12] + ' ' + (y0 + Math.floor(i / 12)), txt = i < 24 ? lab + ': ' + fmtInt(vals[i]) + ' passengers' : lab + ': about ' + fmtBig(vals[i]) + ' expected, likely ' + fmtBig(g.lo[i - 24]) + ' to ' + fmtBig(g.hi[i - 24]);
    s += '<rect class="mhit" data-tip="' + txt + '" x="' + (x(i) - (w - 8) / (n - 1) / 2) + '" y="' + top + '" width="' + ((w - 8) / (n - 1)) + '" height="' + ih + '"><title>' + txt + '</title></rect>';
  }
  s += '</svg>';
  const pk = d3.maxIndex(g.fc.slice(0, 12));
  return '<section><h3>Monthly passengers and forecast</h3><div class="lg"><span><i class="lk"></i>Reported</span><span><i class="lk fc"></i>Forecast</span><span><i class="bk"></i>Likely range</span></div><div class="chart fchart">' + s + '</div>' +
    '<p class="note">Busiest month expected in ' + (F.last + 1) + ': ' + MON[pk] + ', about ' + fmtBig(g.fc[pk]) + ' passengers (likely ' + fmtBig(g.lo[pk]) + ' to ' + fmtBig(g.hi[pk]) + '). The forecast repeats ' + F.last + ' month by month, shifted for where Ramadan and Eid fall. It assumes no growth and no new or dropped routes. Eurostat has not published ' + (F.last + 1) + ' yet.' +
    (g.n[0] !== g.n[1] ? ' The ' + y0 + ' line covers ' + g.n[0] + ' of the ' + g.n[1] + ' routes.' : '') + '</p></section>';
}
function spark(arr, i) {
  const w = 92, h = 18, mx = d3.max(arr) || 1, x = j => 3 + j * (w - 6) / (NY - 1), y = v => h - 3 - v / mx * (h - 6);
  let d = '', pen = false;
  arr.forEach((v, j) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(j).toFixed(1) + ',' + y(v).toFixed(1) + (pen ? '' : 'h.01'); pen = true; });
  const ys = EY.filter((_, j) => arr[j] != null);
  return '<svg class="spark" width="' + w + '" height="' + h + '" role="img" aria-label="Figures for ' + ys[0] + ' to ' + ys[ys.length - 1] + '"><path d="' + d + '" stroke-linecap="round" stroke-linejoin="round"/>' + (arr[i] != null ? '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(arr[i]).toFixed(1) + '" r="2.5"/>' : '') + '</svg>';
}
const legend2 = '<div class="lg"><span><i class="sw dom"></i>Domestic</span><span><i class="sw intl"></i>International</span></div>';
function bar(dom, intl, max) {
  return '<span class="bar">' + (dom ? '<i class="dom" style="width:' + dom / max * 100 + '%"></i>' : '') + (intl ? '<i class="intl" style="width:' + intl / max * 100 + '%"></i>' : '') + '</span>';
}

/* ---------- rail ---------- */
const rail = $('#rail');
function filterLabel() {
  return (state.type === 'dom' ? 'domestic ' : state.type === 'intl' ? 'international ' : '') + 'routes' + (state.carrier ? ' by ' + CAR[state.carrier] : '');
}
function renderRail() {
  const s = state.sel;
  if (pax()) rail.innerHTML = s ? paxAirport(s) : paxOverview(); else if (!s) rail.innerHTML = overview(); else if (AP.has(s)) rail.innerHTML = airport(s); else rail.innerHTML = foreign(s);
  rail.scrollTop = 0;
  rail.querySelectorAll('.chart').forEach(bindChart);
  rail.querySelectorAll('.mhit').forEach(el => { el.addEventListener('pointermove', e => tip(esc(el.dataset.tip), e)); el.addEventListener('pointerleave', () => tip(null)); });
  rail.querySelectorAll('[data-sel]').forEach(b => {
    b.addEventListener('click', () => select(b.dataset.sel || null));
    if (b.dataset.key) { b.addEventListener('pointerenter', () => hov(b.dataset.key, true)); b.addEventListener('pointerleave', () => hov(b.dataset.key, false)); b.addEventListener('focus', () => hov(b.dataset.key, true)); b.addEventListener('blur', () => hov(b.dataset.key, false)); }
  });
}
function overview() {
  const rs = VIS, deg = DEG, yi = YEARS.indexOf(state.year), prev = yi > 0 ? YEARS[yi - 1] : null;
  const stat = (list, d) => ({
    ap: [...d.keys()].filter(k => AP.has(k)).length, dom: list.filter(r => r.k === 'dom').length, intl: list.filter(r => r.k === 'intl').length,
    cc: new Set(list.filter(r => r.k === 'intl').map(r => FX[r.b].country)).size, al: new Set(list.flatMap(r => r.c)).size
  });
  const now = stat(rs, deg), pv = prev ? visible(prev) : null, was = pv ? stat(pv, degrees(pv)) : null;
  const delta = k => was ? '<i>' + (now[k] === was[k] ? 'same as ' : (now[k] > was[k] ? '+' : '−') + Math.abs(now[k] - was[k]) + ' vs ') + prev + '</i>' : '';
  const tile = (k, label) => '<div class="tile"><b class="num">' + now[k] + '</b><span>' + label + '</span>' + delta(k) + '</div>';
  let h = '<section><h2>' + state.year + ' network</h2><p class="sub">' + (state.type !== 'all' || state.carrier ? 'Showing ' + esc(filterLabel()) + '. ' : '') + 'Snapshot of ' + DATA.snap[state.year] + '. Select an airport on the map for its destinations.</p></section>';
  h += '<section><div class="tiles">' + tile('ap', 'Algerian airports with flights') + tile('dom', 'domestic routes') + tile('intl', 'international routes') + tile('cc', 'countries reached') + tile('al', 'airlines') + '</div></section>';
  const rows = YEARS.map(y => { const v = visible(y); return { y, dom: v.filter(r => r.k === 'dom').length, intl: v.filter(r => r.k === 'intl').length }; });
  h += '<section><h3>Routes listed per snapshot</h3>' + legend2 + '<div class="chart">' + yearChart(rows) + '</div><p class="note">Six snapshots: 2014, 2021 to 2024, and 2026. Nothing for 2015–2020 or 2025. Select a column to switch year.</p></section>';
  if (!rs.length) return h + '<section><p class="sub">No ' + esc(filterLabel()) + ' listed in ' + state.year + '.</p></section>';
  if (pv) {
    const a = new Set(rs.map(r => r.key)), b = new Set(pv.map(r => r.key));
    const add = rs.filter(r => !b.has(r.key)), drop = pv.filter(r => !a.has(r.key));
    const chip = r => '<button type="button" data-sel="' + r.a + '" title="' + esc(place(r.a).city + ' – ' + place(r.b).city) + '">' + r.a + '–' + r.b + '</button>';
    h += '<section><h3>Changes since ' + prev + '</h3>' +
      '<details><summary><b class="num">' + add.length + '</b> route' + (add.length === 1 ? '' : 's') + ' added</summary><div class="chips">' + add.map(chip).join('') + '</div></details>' +
      '<details><summary><b class="num">' + drop.length + '</b> route' + (drop.length === 1 ? '' : 's') + ' no longer listed</summary><div class="chips">' + drop.map(chip).join('') + '</div></details></section>';
  }
  const top = [...deg].filter(([k]) => AP.has(k)).sort((a, b) => b[1].n - a[1].n).slice(0, 8), tmax = top[0][1].n;
  h += '<section><h3>Most connected airports</h3><div class="rank">' + top.map(([k, v]) =>
    '<button type="button" data-sel="' + k + '"><span class="c">' + k + '</span><span class="n">' + esc(AP.get(k).city) + '</span><span class="v">' + v.n + '</span>' + bar(v.dom, v.intl, tmax) + '</button>').join('') + '</div></section>';
  const cc = d3.rollups(rs.filter(r => r.k === 'intl'), v => v.length, r => FX[r.b].country).sort((a, b) => b[1] - a[1]);
  if (cc.length) h += '<section><h3>Countries by number of routes</h3><div class="rank wide">' + cc.slice(0, 8).map(([c, n]) =>
    '<div class="rowx"><span class="n">' + esc(c) + '</span><span class="v">' + n + '</span>' + bar(0, n, cc[0][1]) + '</div>').join('') + '</div>' +
    (cc.length > 8 ? '<p class="note">' + (cc.length - 8) + ' more countries with ' + cc.slice(8).reduce((s, x) => s + x[1], 0) + ' routes between them.</p>' : '') + '</section>';
  const al = d3.rollups(rs.flatMap(r => r.c.map(c => ({ c, k: r.k }))), v => ({ dom: v.filter(x => x.k === 'dom').length, intl: v.filter(x => x.k === 'intl').length }), x => x.c)
    .sort((a, b) => (b[1].dom + b[1].intl) - (a[1].dom + a[1].intl));
  const amax = al[0][1].dom + al[0][1].intl;
  h += '<section><h3>Airlines by routes listed</h3><div class="rank wide">' + al.slice(0, 8).map(([c, v]) =>
    '<div class="rowx"><span class="n">' + esc(CAR[c]) + ' <span class="mono" style="color:var(--ink3);font-size:11.5px">' + c + '</span></span><span class="v">' + (v.dom + v.intl) + '</span>' + bar(v.dom, v.intl, amax) + '</div>').join('') + '</div>' +
    (al.length > 8 ? '<p class="note">' + (al.length - 8) + ' more airlines with fewer than ' + ((al[7][1].dom + al[7][1].intl) + 1) + ' routes each.</p>' : '') + '</section>';
  return h;
}
function destRows(code, list) {
  return list.map(r => { const o = place(other(r, code)); return '<button type="button" data-sel="' + o.code + '" data-key="' + r.key + '"><span class="c">' + o.label + '</span><span class="n">' + esc(o.city) + '</span><span class="mono" style="font-size:12px">' + fmtKm(r.km) + '</span>' +
    '<span class="m"><span>' + esc(carriers(r)) + '</span>' + (r.min ? '<span>' + fmtMin(r.min) + '</span>' : '') + dots(r.key) + '</span></button>'; }).join('');
}
function history(code) {
  return YEARS.map(y => { const v = visible(y).filter(r => r.a === code || r.b === code); return { y, dom: v.filter(r => r.k === 'dom').length, intl: v.filter(r => r.k === 'intl').length }; });
}
function apHead(id) {
  const a = AP.get(id);
  return '<button type="button" class="back" data-sel="">← Whole network</button><section><div class="who"><span class="code">' + (a.iata || a.icao) + '</span><span class="nm">' + esc(a.name) + '</span></div><p class="sub">' + esc([a.city, 'Algeria'].filter(Boolean).join(', ')) + '</p>' +
    '<dl class="facts"><dt>ICAO</dt><dd class="mono">' + esc(a.icao) + '</dd><dt>Position</dt><dd class="mono">' + dms(a.lat, 'N', 'S', 2) + ' ' + dms(a.lon, 'E', 'W', 3) + '</dd>' +
    (a.elev != null ? '<dt>Elevation</dt><dd class="mono">' + a.elev + ' m (' + Math.round(a.elev / 0.3048) + ' ft)</dd>' : '') +
    '<dt>Class</dt><dd>' + TYPE_NAME[a.t] + '</dd>' + (a.wiki ? '<dt>More</dt><dd><a href="' + esc(a.wiki) + '" target="_blank" rel="noopener">Wikipedia article</a></dd>' : '') + '</dl></section>';
}
function fxHead(code) {
  const f = FX[code];
  return '<button type="button" class="back" data-sel="">← Whole network</button><section><div class="who"><span class="code">' + code + '</span><span class="nm">' + esc(f.name) + '</span></div><p class="sub">' + esc(f.city + ', ' + f.country) + '</p></section>';
}
function airport(id) {
  const rs = VIS.filter(r => r.a === id || r.b === id), dom = rs.filter(r => r.k === 'dom').sort((p, q) => p.km - q.km), intl = rs.filter(r => r.k === 'intl');
  let h = apHead(id);
  const hist = history(id), ever = hist.some(r => r.dom + r.intl);
  if (ever) h += '<section><h3>Destinations per snapshot</h3>' + legend2 + '<div class="chart">' + yearChart(hist) + '</div></section>';
  if (!rs.length) return h + '<section><p class="sub">No ' + esc(filterLabel()) + ' listed from here in ' + state.year + '.' + (ever ? ' Other years are in the chart above.' : ' None of the six snapshots lists scheduled flights here.') + '</p></section>';
  h += '<section><h3>' + state.year + ' destinations</h3><p class="note">Squares show the snapshots that list the route: ' + YEARS.join(', ') + '.</p><div class="dest">';
  if (dom.length) h += '<div class="grp"><i class="sw dom"></i>Domestic · ' + dom.length + '</div>' + destRows(id, dom);
  if (intl.length) {
    h += '<div class="grp"><i class="sw intl"></i>International · ' + intl.length + '</div>';
    for (const [c, list] of d3.groups(intl, r => FX[r.b].country).sort((p, q) => q[1].length - p[1].length || d3.ascending(p[0], q[0])))
      h += '<div class="grp" style="padding-top:8px;letter-spacing:.04em">' + esc(c) + '</div>' + destRows(id, list.sort((p, q) => p.km - q.km));
  }
  return h + '</div></section>';
}
function foreign(code) {
  const rs = VIS.filter(r => r.b === code).sort((p, q) => p.km - q.km);
  let h = fxHead(code);
  h += '<section><h3>Algerian airports linked per snapshot</h3><div class="chart">' + yearChart(history(code)) + '</div></section>';
  if (!rs.length) return h + '<section><p class="sub">No ' + esc(filterLabel()) + ' listed to Algeria in ' + state.year + '.</p></section>';
  return h + '<section><h3>' + state.year + ' links to Algeria</h3><div class="dest">' + destRows(code, rs) + '</div></section>';
}

/* ---------- rail: passengers to Europe ---------- */
function paxStats(y, code) {
  const i = y - ES.y0, o = { P: 0, S: 0, C: 0, n: 0, cc: new Set(), ps: 0, ss: 0, has: { P: 0, S: 0, C: 0 } };
  for (const p of EP) {
    if (code && p.a !== code && p.b !== code) continue;
    if (p.P[i] == null && p.S[i] == null && p.C[i] == null) continue;
    o.n++; o.cc.add(p.cc);
    for (const m of 'PSC') if (p[m][i] != null) { o[m] += p[m][i]; o.has[m]++; }
    if (p.P[i] != null && p.S[i] != null) { o.ps += p.P[i]; o.ss += p.S[i]; }
  }
  o.lf = o.ss ? o.ps / o.ss : null; o.cc = o.cc.size; return o;
}
function paxTiles(code) {
  const y = state.py, now = paxStats(y, code), was = y > ES.y0 ? paxStats(y - 1, code) : null;
  const d = k => {
    if (!was) return '';
    let a = 0, b = 0; const i = y - ES.y0;
    for (const p of EP) { if (code && p.a !== code && p.b !== code) continue; if (p[k][i] != null && p[k][i - 1] != null) { a += p[k][i]; b += p[k][i - 1]; } }
    if (!b) return '';
    const ch = (a - b) / b; return '<i>' + (ch >= 0 ? '+' : '−') + Math.abs(Math.round(ch * 100)) + '% on routes also in ' + (y - 1) + '</i>';
  };
  const t = (v, label, extra) => '<div class="tile"><b class="num">' + v + '</b><span>' + label + '</span>' + (extra || '') + '</div>';
  return '<div class="tiles">' + t(now.has.P ? fmtBig(now.P) : '–', 'passengers carried', d('P')) + t(now.has.C ? fmtBig(now.C) : '–', 'flights', d('C')) + t(now.has.S ? fmtBig(now.S) : '–', 'seats offered', d('S')) +
    t(now.lf != null ? Math.round(now.lf * 100) + '%' : '–', 'of seats filled') + t(now.n, 'routes with a figure', was ? '<i>' + (now.n === was.n ? 'same as ' : (now.n > was.n ? '+' : '−') + Math.abs(now.n - was.n) + ' vs ') + (y - 1) + '</i>' : '') +
    (code ? '' : t(now.cc, 'European countries')) + '</div>';
}
function paxSeries(code) { const m = state.meas; return EY.map(y => { const st = paxStats(y, code); return { y, v: st.has[m] ? st[m] : null, n: st.has[m] }; }); }
const paxNote = '<p class="note">Eurostat only publishes each airport\'s main routes, so a missing year means no published figure, not no flights. Select a column to switch year.</p>';
function paxOverview() {
  const rs = VIS, unit = MEAS[state.meas][1];
  let h = '<section><h2>' + state.py + ' Algeria–Europe</h2><p class="sub">Traffic on the routes European airports report to Eurostat, both directions added together. Select an airport for its routes.</p></section>';
  h += '<section>' + paxTiles() + '</section>';
  h += '<section><h3>' + MEAS[state.meas][0] + ' per year on reported routes</h3><div class="chart">' + totalsChart(paxSeries()) + '</div>' + paxNote + '</section>';
  h += forecastSection();
  if (!rs.length) return h + '<section><p class="sub">No ' + unit + ' figure published for ' + state.py + '.</p></section>';
  const top = rs.slice().sort((a, b) => b.v - a.v), mx = top[0].v;
  h += '<section><h3>Busiest routes by ' + unit + '</h3><div class="rank r3">' + top.slice(0, 10).map(r =>
    '<button type="button" data-sel="' + r.a + '" data-key="' + r.key + '"><span class="c">' + r.a + '–' + r.b + '</span><span class="n">' + esc(place(r.a).city + ' – ' + place(r.b).city) + '</span><span class="v">' + fmtBig(r.v) + '</span>' + bar(0, r.v, mx) + '</button>').join('') + '</div>' +
    (top.length > 10 ? '<p class="note">' + (top.length - 10) + ' more routes are in the table below.</p>' : '') + '</section>';
  const cc = d3.rollups(rs, v => d3.sum(v, r => r.v), r => FX[r.b].country).sort((a, b) => b[1] - a[1]);
  h += '<section><h3>By European country</h3><div class="rank wide big">' + cc.map(([c, n]) => '<div class="rowx"><span class="n">' + esc(c) + '</span><span class="v">' + fmtBig(n) + '</span>' + bar(0, n, cc[0][1]) + '</div>').join('') + '</div></section>';
  const ap = d3.rollups(rs, v => d3.sum(v, r => r.v), r => r.a).sort((a, b) => b[1] - a[1]);
  h += '<section><h3>By Algerian airport</h3><div class="rank r3">' + ap.map(([k, n]) => '<button type="button" data-sel="' + k + '"><span class="c">' + k + '</span><span class="n">' + esc(AP.get(k).city) + '</span><span class="v">' + fmtBig(n) + '</span>' + bar(0, n, ap[0][1]) + '</button>').join('') + '</div></section>';
  return h;
}
function paxAirport(code) {
  const dzSide = AP.has(code), i = state.py - ES.y0, m = state.meas, unit = MEAS[m][1];
  const mine = EP.filter(p => p.a === code || p.b === code);
  let h = dzSide ? apHead(code) : fxHead(code);
  if (!mine.length) return h + '<section><p class="sub">Eurostat publishes no route figures for this airport. Its listed routes are in the Listed routes view.</p></section>';
  h += '<section>' + paxTiles(code) + '</section>';
  h += '<section><h3>' + MEAS[m][0] + ' per year on reported routes</h3><div class="chart">' + totalsChart(paxSeries(code)) + '</div>' + paxNote + '</section>';
  h += forecastSection(code);
  const row = p => {
    const o = place(dzSide ? p.b : p.a), v = p[m][i], ys = EY.filter((_, j) => p[m][j] != null);
    return '<button type="button" data-sel="' + o.code + '" data-key="' + p.key + '"><span class="c">' + o.label + '</span><span class="n">' + esc(o.city) + '</span><span class="val">' + (v == null ? '–' : fmtInt(v)) + '</span><span class="m">' +
      (v == null ? '<span>' + (ys.length ? 'figures for ' + ys[0] + (ys.length > 1 ? '–' + ys[ys.length - 1] : '') : 'no ' + unit + ' figures') + '</span>' : '<span>' + (m === 'C' ? fmtInt(p.P[i]) + ' passengers' : fmtInt(p.C[i]) + ' flights') + '</span><span>' + pct(p.P[i], p.S[i]) + ' of seats filled</span>') + (ys.length ? spark(p[m], i) : '') + '</span></button>';
  };
  const cur = mine.filter(p => p[m][i] != null).sort((a, b) => b[m][i] - a[m][i]), rest = mine.filter(p => p[m][i] == null);
  h += '<section><h3>Routes by ' + unit + '</h3><p class="note">The small line on each row runs from ' + ES.y0 + ' to ' + ES.y1 + ', with a dot at ' + state.py + '.</p><div class="dest">';
  if (cur.length) h += '<div class="grp"><i class="sw intl"></i>' + state.py + ' · ' + cur.length + ' route' + (cur.length === 1 ? '' : 's') + '</div>' + cur.map(row).join('');
  if (rest.length) h += '<div class="grp">No ' + unit + ' figure for ' + state.py + ' · ' + rest.length + '</div>' + rest.map(row).join('');
  return h + '</div></section>';
}

/* ---------- table ---------- */
const COLS = [
  { id: 'from', label: 'From', get: r => r.a }, { id: 'to', label: 'To', get: r => place(r.b).city }, { id: 'country', label: 'Country', get: r => place(r.b).country },
  { id: 'type', label: 'Type', get: r => r.k }, { id: 'air', label: 'Airlines', get: r => carriers(r) },
  { id: 'km', label: 'Distance', get: r => r.km, r: 1 }, { id: 'min', label: 'Flight time', get: r => r.min || 0, r: 1 }, { id: 'n', label: 'Snapshots', get: r => LISTED.get(r.key).length }
];
const nz = v => v == null ? -1 : v;
const PCOLS = [
  { id: 'from', label: 'From', get: r => r.a }, { id: 'to', label: 'To', get: r => place(r.b).city }, { id: 'country', label: 'Country', get: r => place(r.b).country },
  { id: 'P', label: 'Passengers', get: r => nz(r.P), r: 1 }, { id: 'C', label: 'Flights', get: r => nz(r.C), r: 1 }, { id: 'S', label: 'Seats', get: r => nz(r.S), r: 1 },
  { id: 'lf', label: 'Seats filled', get: r => r.P != null && r.S ? r.P / r.S : -1, r: 1 }, { id: 'pf', label: 'Passengers per flight', get: r => r.P != null && r.C ? r.P / r.C : -1, r: 1 },
  { id: 'yrs', label: 'Figures for', get: r => EY.filter((_, j) => r.p.P[j] != null || r.p.C[j] != null).length, r: 1 }
];
function tableRows() {
  const s = state.sel, q = state.q.trim().toLowerCase(), cols = pax() ? PCOLS : COLS, sort = pax() ? state.psort : state.sort;
  let rs = VIS.filter(r => !s || r.a === s || r.b === s);
  if (q) rs = rs.filter(r => { const a = place(r.a), b = place(r.b); return (r.a + ' ' + r.b + ' ' + a.city + ' ' + b.city + ' ' + b.country + ' ' + carriers(r) + ' ' + r.c.join(' ')).toLowerCase().includes(q); });
  const c = cols.find(c => c.id === sort.col);
  return rs.sort((p, q2) => { const x = c.get(p), y = c.get(q2); return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir || p.key.localeCompare(q2.key); });
}
function renderTable() {
  const rs = tableRows(), s = state.sel;
  $('#csv').textContent = pax() ? 'Copy all years as CSV' : 'Copy as CSV'; $('#csvbox').hidden = true;
  if (pax()) return renderPaxTable(rs, s);
  $('#tbl-title').textContent = state.year + ' routes' + (s ? ' at ' + place(s).label : '');
  $('#tbl-note').textContent = rs.length + ' ' + (rs.length === 1 ? 'route' : 'routes') + ' shown, following the filters above' + (s ? ' and the selected airport' : '') + '. Snapshots column: ' + YEARS.join(' · ') + '.';
  $('#tbl thead').innerHTML = '<tr>' + COLS.map(c => '<th class="' + (c.r ? 'r' : '') + '" aria-sort="' + (state.sort.col === c.id ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-col="' + c.id + '">' + c.label + (state.sort.col === c.id ? (state.sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>').join('') + '</tr>';
  $('#tbl tbody').innerHTML = rs.map(r => { const a = place(r.a), b = place(r.b); return '<tr><td><span class="mono"><b>' + a.label + '</b></span> ' + esc(a.city) + '</td><td><span class="mono"><b>' + b.label + '</b></span> ' + esc(b.city) + '</td><td>' + esc(b.country) + '</td><td><i class="sw ' + r.k + '"></i>' + (r.k === 'dom' ? 'Domestic' : 'International') + '</td><td class="wrap">' + esc(carriers(r)) + '</td><td class="r mono">' + fmtKm(r.km) + '</td><td class="r mono">' + (fmtMin(r.min) || '–') + '</td><td>' + dots(r.key) + '</td></tr>'; }).join('') ||
    '<tr><td colspan="8">No routes match.</td></tr>';
  $('#tbl thead').querySelectorAll('button').forEach(b => b.onclick = () => { const c = b.dataset.col; state.sort = { col: c, dir: state.sort.col === c ? -state.sort.dir : 1 }; renderTable(); });
}
function renderPaxTable(rs, s) {
  const sort = state.psort, unit = MEAS[state.meas][1];
  $('#tbl-title').textContent = state.py + ' Europe routes' + (s ? ' at ' + place(s).label : '');
  $('#tbl-note').textContent = rs.length + ' ' + (rs.length === 1 ? 'route' : 'routes') + ' with a ' + unit + ' figure for ' + state.py + (s ? ' at the selected airport' : '') + '. Source: Eurostat. Passengers count both directions.';
  $('#tbl thead').innerHTML = '<tr>' + PCOLS.map(c => '<th class="' + (c.r ? 'r' : '') + '" aria-sort="' + (sort.col === c.id ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" data-col="' + c.id + '">' + c.label + (sort.col === c.id ? (sort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>').join('') + '</tr>';
  $('#tbl tbody').innerHTML = rs.map(r => { const a = place(r.a), b = place(r.b), ys = EY.filter((_, j) => r.p.P[j] != null || r.p.C[j] != null);
    return '<tr><td><span class="mono"><b>' + a.label + '</b></span> ' + esc(a.city) + '</td><td><span class="mono"><b>' + b.label + '</b></span> ' + esc(b.city) + '</td><td>' + esc(b.country) + '</td><td class="r mono">' + fmtInt(r.P) + '</td><td class="r mono">' + fmtInt(r.C) + '</td><td class="r mono">' + fmtInt(r.S) + '</td><td class="r mono">' + pct(r.P, r.S) + '</td><td class="r mono">' + (r.P != null && r.C ? Math.round(r.P / r.C) : '–') + '</td><td class="r mono">' + ys[0] + '–' + ys[ys.length - 1] + ' (' + ys.length + ')</td></tr>'; }).join('') ||
    '<tr><td colspan="9">No routes match.</td></tr>';
  $('#tbl thead').querySelectorAll('button').forEach(b => b.onclick = () => { const c = b.dataset.col, num = PCOLS.find(x => x.id === c).r; state.psort = { col: c, dir: sort.col === c ? -sort.dir : (num ? -1 : 1) }; renderTable(); });
}
function paxCsv() {
  const s = state.sel, t = state.q.trim().toLowerCase(), qq = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = [['year', 'from', 'from_city', 'to', 'to_city', 'to_country', 'passengers', 'flights', 'seats'].join(',')];
  for (const p of EP) {
    if (s && p.a !== s && p.b !== s) continue;
    const a = place(p.a), b = place(p.b);
    if (t && !(p.a + ' ' + p.b + ' ' + a.city + ' ' + b.city + ' ' + b.country).toLowerCase().includes(t)) continue;
    EY.forEach((y, j) => { if (p.P[j] != null || p.C[j] != null || p.S[j] != null) lines.push([y, p.a, qq(a.city), p.b, qq(b.city), qq(b.country), p.P[j] ?? '', p.C[j] ?? '', p.S[j] ?? ''].join(',')); });
  }
  return lines;
}
$('#q').addEventListener('input', e => { state.q = e.target.value; renderTable(); });
$('#csv').onclick = () => {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const lines = pax() ? paxCsv() : [['year', 'from', 'from_city', 'to', 'to_city', 'to_country', 'type', 'airlines', 'distance_km', 'flight_minutes', 'listed_in'].join(',')];
  if (!pax()) for (const r of tableRows()) { const a = place(r.a), b = place(r.b); lines.push([state.year, r.a, q(a.city), r.b, q(b.city), q(b.country), r.k === 'dom' ? 'domestic' : 'international', q(carriers(r)), r.km, r.min || '', q(LISTED.get(r.key).join(' '))].join(',')); }
  const text = lines.join('\n'), btn = $('#csv'), box = $('#csvbox');
  const fallback = () => { box.hidden = false; box.value = text; box.focus(); box.select(); btn.textContent = 'Select all and copy below'; };
  try { navigator.clipboard.writeText(text).then(() => { btn.textContent = 'Copied ' + (lines.length - 1) + ' rows'; const lbl = pax() ? 'Copy all years as CSV' : 'Copy as CSV'; setTimeout(() => btn.textContent = lbl, 2200); }, fallback); } catch (e) { fallback(); }
};

/* ---------- controls ---------- */
function render() { drawMap(); renderRail(); renderTable(); }
function setYear(y) { state.year = y; document.querySelectorAll('#years button').forEach(b => b.setAttribute('aria-pressed', b.dataset.y === y)); render(); }
function select(code) {
  if (code === state.sel) return;
  state.sel = code; render();
  if (!code) return;
  const rs = VIS.filter(r => r.a === code || r.b === code);
  if (rs.length) fitRoutes(rs, true);
  else { const p = XY.get(code); go(d3.zoomIdentity.translate(W / 2 - 3 * p[0], H / 2 - 3 * p[1]).scale(3)); }
}
function setMode(m) {
  state.mode = m; tip(null);
  document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
  document.querySelectorAll('.controls [data-for]').forEach(el => el.hidden = el.dataset.for !== m);
  render();
  if (state.sel) { const rs = VIS.filter(r => r.a === state.sel || r.b === state.sel); if (rs.length) fitRoutes(rs, true); }
  else if (m === 'pax' && VIS.length) fitRoutes(VIS.concat(), false); else go(d3.zoomIdentity);
}
$('#modes').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.m !== state.mode) setMode(b.dataset.m); });
const pyEl = $('#py'); pyEl.min = ES.y0; pyEl.max = ES.y1; pyEl.value = state.py; $('#pyout').textContent = state.py;
function setPY(y) { y = Math.max(ES.y0, Math.min(ES.y1, +y)); if (y === state.py) return; state.py = y; pyEl.value = y; $('#pyout').textContent = y; if (pax()) render(); }
pyEl.addEventListener('input', e => setPY(e.target.value));
$('#pyprev').onclick = () => setPY(state.py - 1); $('#pynext').onclick = () => setPY(state.py + 1);
$('#meas').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if ('PSC'.includes(state.psort.col)) state.psort = { col: b.dataset.v, dir: -1 };
  state.meas = b.dataset.v; document.querySelectorAll('#meas button').forEach(x => x.setAttribute('aria-pressed', x === b)); render();
});
$('#years').innerHTML = YEARS.map(y => '<button type="button" data-y="' + y + '" aria-pressed="' + (y === state.year) + '">' + y + '</button>').join('');
$('#years').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setYear(b.dataset.y); });
$('#types').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.type = b.dataset.t; document.querySelectorAll('#types button').forEach(x => x.setAttribute('aria-pressed', x === b)); render();
  if (!state.sel) { if (state.type === 'dom') go(d3.zoomIdentity); else if (state.type === 'intl' && VIS.length) fitRoutes(VIS.concat(), true); }
});
$('#airline').innerHTML = '<option value="">All airlines</option>' + Object.entries(CAR).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => '<option value="' + c + '">' + esc(n) + ' (' + c + ')</option>').join('');
$('#airline').addEventListener('change', e => { state.carrier = e.target.value; render(); });
$('#idle').addEventListener('change', e => { state.idle = e.target.checked; drawMap(); });
const apLabel = a => (a.iata || a.icao) + ' · ' + (a.city ? a.city + ' · ' : '') + a.name;
$('#aplist').innerHTML = DATA.airports.map(a => '<option value="' + esc(apLabel(a)) + '"></option>').join('');
$('#find').addEventListener('change', e => {
  const v = e.target.value.trim().toLowerCase(); if (!v) return;
  const hit = DATA.airports.find(a => apLabel(a).toLowerCase() === v) || DATA.airports.find(a => (a.iata || '').toLowerCase() === v || a.icao.toLowerCase() === v) || DATA.airports.find(a => apLabel(a).toLowerCase().includes(v));
  if (hit) { select(hit.id); e.target.value = ''; }
});
const nAir = DATA.airports.filter(a => a.t !== 'H').length, nHel = DATA.airports.length - nAir;
$('#src').innerHTML =
  '<li><b>Airports:</b> OurAirports, public domain. ' + nAir + ' open airports and airfields plus ' + nHel + ' heliports in Algeria; closed sites are left out.</li>' +
  '<li><b>Routes 2021–2026:</b> the airline-route-data project by Jonty Wareing, a weekly scrape of airline schedules. One late-summer snapshot per year: ' + YEARS.slice(1).map(y => DATA.snap[y]).join(', ') + '.</li>' +
  '<li><b>Routes 2014:</b> the OpenFlights route database, last updated in June 2014 (Open Database License).</li>' +
  '<li><b>Passengers, seats and flights 1993–2024:</b> Eurostat route tables (avia_par), one per reporting country, annual figures. All 34 available country tables were checked; ' + Object.keys(ES.upd).length + ' contain Algerian routes: France, Spain, Italy, Germany, Belgium, Türkiye and the United Kingdom. France was last updated on ' + ES.upd.FR + '.</li>' +
  '<li><b>Base map:</b> Natural Earth, drawn in an azimuthal equidistant projection centred on Algiers, so the rings show true distance from ALG.</li>';

new ResizeObserver(() => { clearTimeout(layout.t); layout.t = setTimeout(layout, 120); }).observe(wrap);
layout(); renderRail(); renderTable();
const h0 = (location.hash || '').slice(1).toUpperCase();
if (h0 && (AP.has(h0) || FX[h0])) select(h0);
}

Promise.all(['data.json', 'world.json'].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); })))
  .then(([data, world]) => start(data, world))
  .catch(err => {
    document.getElementById('rail').innerHTML = '<section><h2>Data not loaded</h2><p class="sub">The page could not read its data files. ' +
      'Run <span class="mono">python run_all.py</span>, then serve the site folder over HTTP, for example <span class="mono">python -m http.server 8000 --directory site</span>.</p></section>';
    console.error(err);
  });
