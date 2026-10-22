import { formatPercent, formatUsdCompact } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useMemo } from "react";
import world from "../assets/world.json";
import { perilsIn } from "./Peril";

type Layer = EndpointResponse<"reinsuranceLayers">["data"]["layers"][number];

const W = world as unknown as {
  viewBox: number[];
  anchors: Record<string, [number, number]>;
  countries: { id: string; name: string; d: string }[];
};

/** ISO 3166 numeric ids as Natural Earth writes them. */
const ISO: Record<string, string> = {
  US: "840",
  CA: "124",
  MX: "484",
  JP: "392",
  AU: "036",
  NZ: "554",
};
const NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  MX: "Mexico",
  JP: "Japan",
  AU: "Australia",
  NZ: "New Zealand",
};

/** Which named countries a layer's peril text covers, and whether it is not tied to a region at all. */
export function regionsOf(perils: string): {
  countries: string[];
  unspecific: "worldwide" | "multi" | null;
} {
  const p = perils.toLowerCase();
  if (p.includes("worldwide")) return { countries: [], unspecific: "worldwide" };
  if (p.includes("multi region")) return { countries: [], unspecific: "multi" };
  const set = new Set<string>();
  if (p.includes("north america")) ["US", "CA", "MX"].forEach((c) => set.add(c));
  if (p.includes("united states")) set.add("US");
  if (p.includes("japan")) set.add("JP");
  if (p.includes("australia")) set.add("AU");
  if (p.includes("new zealand")) set.add("NZ");
  return { countries: [...set], unspecific: null };
}

export interface Exposure {
  /** Share of bound capital by country: a layer counts in full for every country it names. */
  byCountry: Record<string, number>;
  worldwide: number;
  multi: number;
  other: number;
  total: number;
}

export function exposureOf(layers: Layer[]): Exposure {
  const bound = layers.filter((l) => l.status === "Bound");
  const total = bound.reduce((a, l) => a + l.capital, 0);
  const byCountry: Record<string, number> = {};
  let worldwide = 0;
  let multi = 0;
  let other = 0;
  for (const l of bound) {
    const r = regionsOf(l.perils);
    if (r.unspecific === "worldwide") worldwide += l.capital;
    else if (r.unspecific === "multi") multi += l.capital;
    else if (r.countries.length === 0) other += l.capital;
    for (const c of r.countries) byCountry[c] = (byCountry[c] ?? 0) + l.capital;
  }
  const share = (v: number): number => (total === 0 ? 0 : v / total);
  return {
    byCountry: Object.fromEntries(Object.entries(byCountry).map(([k, v]) => [k, share(v)])),
    worldwide: share(worldwide),
    multi: share(multi),
    other: share(other),
    total,
  };
}

/** Five steps from pale yellow to black, so the largest exposure is the darkest. */
const STEPS = [
  { min: 0.25, fill: "#151514", ink: "#f8f8f6" },
  { min: 0.1, fill: "#c9a91e", ink: "#111111" },
  { min: 0.04, fill: "#f4d64e", ink: "#111111" },
  { min: 0.0001, fill: "#faf1c4", ink: "#111111" },
];
const stepOf = (share: number): { fill: string; ink: string } | null =>
  STEPS.find((s) => share >= s.min) ?? null;

/** A world map with the countries the reinsurance book names shaded by their share of bound capital. */
export function ExposureMap({ layers }: { layers: Layer[] }) {
  const ex = useMemo(() => exposureOf(layers), [layers]);
  const named = Object.entries(ex.byCountry).sort((a, b) => b[1] - a[1]);
  const ids = new Map(named.map(([c]) => [ISO[c], c]));
  const [x0, y0, w, h] = W.viewBox as [number, number, number, number];
  const summary = `Bound capital of ${formatUsdCompact(ex.total)}. ${named.map(([c, s]) => `${NAMES[c] ?? c} ${formatPercent(s, 1)}`).join(", ")}. Not tied to one region: ${formatPercent(ex.worldwide + ex.multi, 1)}.`;

  return (
    <figure className="exposure">
      <svg
        viewBox={`${x0} ${y0} ${w} ${h}`}
        role="img"
        aria-label={summary}
        className="exposure-map"
      >
        {W.countries.map((c) => {
          const code = ids.get(c.id);
          const step = code === undefined ? null : stepOf(ex.byCountry[code] ?? 0);
          return (
            <path
              key={c.id}
              d={c.d}
              fill={step?.fill ?? "var(--fill-strong)"}
              stroke="var(--surface)"
              strokeWidth={0.6}
            >
              <title>
                {c.name}
                {code === undefined
                  ? ""
                  : `: ${formatPercent(ex.byCountry[code] ?? 0, 1)} of bound capital`}
              </title>
            </path>
          );
        })}
        {named.map(([code, share]) => {
          const a = W.anchors[code];
          if (a === undefined) return null;
          return (
            <g key={code} transform={`translate(${a[0]} ${a[1]})`} aria-hidden="true">
              <rect
                x={-24}
                y={-10}
                width={48}
                height={20}
                rx={10}
                fill="var(--surface)"
                stroke="var(--ink)"
                strokeWidth={1}
              />
              <text textAnchor="middle" y={4} fontSize={11} fontWeight={700} fill="var(--ink)">
                {code} {formatPercent(share, 0)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="exposure-legend">
        <ul>
          {STEPS.slice()
            .reverse()
            .map((s, i, all) => (
              <li key={s.fill}>
                <span className="swatch" style={{ background: s.fill }} aria-hidden="true" />
                {i === all.length - 1
                  ? `${formatPercent(s.min, 0)} or more`
                  : `${formatPercent(s.min, 0)} to ${formatPercent(all[i + 1]?.min ?? 1, 0)}`}
              </li>
            ))}
        </ul>
        <p>
          A layer counts in full for every country it names, so shares can add to more than 100%.{" "}
          <b>{formatPercent(ex.worldwide, 1)}</b> of bound capital is in worldwide layers and{" "}
          <b>{formatPercent(ex.multi, 1)}</b> in multi-region layers, which are not tied to one
          place and are not shaded.
          {ex.other > 0 && (
            <> {formatPercent(ex.other, 1)} is contingency cover with no geography.</>
          )}
        </p>
      </figcaption>
    </figure>
  );
}

/** Used by the layer table: the perils of one layer as icons. */
export const perilIconsFor = (perils: string) => perilsIn(perils);
