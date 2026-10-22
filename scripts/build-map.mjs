#!/usr/bin/env node
// Builds apps/web-calm/src/assets/world.json: country outlines as SVG path strings, from the Natural Earth 1:110m data in
// the world-atlas package (public domain), projected with Equal Earth. The geometry is computed from that data; no path is
// drawn by hand. Run once: node scripts/build-map.mjs
import { writeFileSync } from "node:fs";

const SRC = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
const topo = await (await fetch(SRC, { signal: AbortSignal.timeout(60_000) })).json();
const { scale, translate } = topo.transform;

// Absolute [lon, lat] points of every arc (arcs are delta encoded).
const arcs = topo.arcs.map((arc) => {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
  });
});
const ring = (indexes) => indexes.flatMap((i) => (i >= 0 ? arcs[i] : [...arcs[~i]].reverse()));

// Equal Earth (Savric, Patterson, Jenny 2018), radians in, unit-less out.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
function equalEarth(lon, lat) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const theta = Math.asin((Math.sqrt(3) / 2) * Math.sin(phi));
  const t2 = theta * theta;
  const t6 = t2 ** 3;
  const x =
    (2 * Math.sqrt(3) * lam * Math.cos(theta)) /
    (3 * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

const W = 1000;
const [x0] = equalEarth(-180, 0);
const [, yTop] = equalEarth(0, 84); // Antarctica is left out: no exposure there
const [, yBottom] = equalEarth(0, -58);
const k = W / (2 * Math.abs(x0));
const H = Math.round((yTop - yBottom) * k);
const px = ([lon, lat]) => {
  const [x, y] = equalEarth(lon, lat);
  return [Math.round((x * k + W / 2) * 10) / 10, Math.round((yTop - y) * k * 10) / 10];
};

const geoms = topo.objects.countries.geometries;
const countries = geoms
  .filter((g) => g.properties?.name !== "Antarctica")
  .map((g) => {
    const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
    const d = polys
      .flatMap((poly) =>
        poly.map((r) => {
          const pts = ring(r).map(px);
          return "M" + pts.map((p) => p.join(" ")).join("L") + "Z";
        }),
      )
      .join("");
    return { id: String(g.id ?? ""), name: g.properties?.name ?? "", d };
  })
  .filter((c) => c.d !== "");

// Where to print a label for the regions the book names, as projected points (longitude, latitude of a representative place).
const anchors = Object.fromEntries(
  Object.entries({
    US: [-98, 39],
    CA: [-104, 57],
    MX: [-102, 23.5],
    JP: [138, 37],
    AU: [134, -25],
    NZ: [172, -42],
  }).map(([id, ll]) => [id, px(ll)]),
);

writeFileSync(
  new URL("../apps/web-calm/src/assets/world.json", import.meta.url),
  JSON.stringify({
    viewBox: [0, 0, W, H],
    source: SRC,
    projection: "Equal Earth",
    anchors,
    countries,
  }),
);
console.log(
  "countries:",
  countries.length,
  "viewBox",
  W,
  H,
  "bytes",
  JSON.stringify(countries).length,
);
