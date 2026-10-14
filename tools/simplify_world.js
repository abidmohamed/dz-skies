// Rebuilds site/world.json from Natural Earth (via the world-atlas package).
// npm install world-atlas@2.0.2 topojson-client@3.1.0 topojson-simplify@3.0.3
// node tools/simplify_world.js 0.45 site/world.json
const fs = require("fs");
const topojson = Object.assign({}, require("topojson-client"), require("topojson-simplify"));
let topo = JSON.parse(fs.readFileSync(process.argv[4] || "node_modules/world-atlas/countries-50m.json"));
topo = topojson.presimplify(topo);
const thr = topojson.quantile(topo, +process.argv[2] || 0.4);
topo = topojson.simplify(topo, thr);
topo = topojson.filter(topo, topojson.filterWeight(topo, 0.002));
delete topo.objects.land;
for (const g of topo.objects.countries.geometries) { g.properties = { n: g.properties.name }; }
const q = topojson.quantize ? topojson.quantize(topo, 1e5) : topo;
const s = JSON.stringify(q);
fs.writeFileSync(process.argv[3], s);
const dz = q.objects.countries.geometries.find(g => g.id === "012");
console.log("bytes", s.length, "countries", q.objects.countries.geometries.length, "DZ", dz && dz.properties, "WS", q.objects.countries.geometries.filter(g => /Sahara|Morocco/.test(g.properties.n)).map(g => g.id + ":" + g.properties.n));
