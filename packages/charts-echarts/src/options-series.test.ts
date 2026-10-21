import { readFileSync } from "node:fs";
import {
  capitalStackedSpec,
  leaderboardBarsSpec,
  marketSpec,
  navSpec,
  premiumBarsSpec,
} from "@onyc/chart-specs";
import type { EndpointResponse } from "@onyc/sdk";
import { describe, expect, it } from "vitest";
import { optionFor } from "./options.js";
import type { ChartTokens } from "./tokens.js";

const circle: ChartTokens = {
  ground: "#ffffff",
  surface: "#ffffff",
  ink: "#101828",
  muted: "#475467",
  line: "#e4e8ee",
  grid: "#eef1f5",
  accent: "#0b6bcb",
  good: "#0b5c3e",
  bad: "#9a1b3a",
  series: ["#0b6bcb", "#1b9aaa", "#7fb2e5", "#3e4c6b", "#9aa7bd", "#14866d", "#c5d3e3"],
  fontUi: "Figtree",
  fontMono: "Figtree",
  stroke: 3,
  radius: 8,
  tooltipBg: "#ffffff",
  tooltipInk: "#101828",
  marker: "circle",
};
const rect: ChartTokens = { ...circle, marker: "rect", radius: 0 };

const load = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../chart-specs/fixtures/${name}.json`, import.meta.url), "utf8"),
  ) as T;
const nav = load<EndpointResponse<"nav">>("nav");
const market = load<EndpointResponse<"market">>("market");
const dist = load<EndpointResponse<"capitalDistribution">>("capital_distribution");
const board = load<EndpointResponse<"leaderboard">>("leaderboard");

type Series = {
  type: string;
  name?: string;
  step?: string | false;
  stack?: string;
  data?: unknown[];
  itemStyle?: { decal?: unknown };
  markPoint?: { data: { coord: unknown[]; itemStyle?: { borderColor?: string } }[] };
};
type Opt = { series: Series[]; yAxis: Record<string, unknown>; xAxis: Record<string, unknown> };
const build = (spec: Parameters<typeof optionFor>[0], tokens = circle): Opt =>
  optionFor(spec, { tokens, motion: false }) as unknown as Opt;

describe("time series option", () => {
  const spec = navSpec(nav);

  it("draws one line per series and marks every event and the end point", () => {
    const o = build(spec);
    const lines = o.series.filter((s) => s.type === "line");
    expect(lines).toHaveLength(spec.series.length);
    const marks = lines[0]?.markPoint?.data ?? [];
    expect(marks).toHaveLength(spec.annotations.filter((a) => a.kind !== "threshold").length);
  });

  it("uses straight lines for the round skin and step lines with a dotted fill for the square skin", () => {
    expect(build(spec).series[0]?.step).toBe(false);
    const square = build(spec, rect).series[0];
    expect(square?.step).toBe("end");
    expect(square?.itemStyle?.decal).toBeDefined();
  });

  it("starts the y axis away from zero for price-like series and at zero otherwise", () => {
    expect(build(spec).yAxis["min"]).toBeGreaterThan(0.9);
    expect(build({ ...spec, zeroBased: true }).yAxis["min"]).toBeUndefined();
  });

  it("shades the market spread with three stacked helper series that never reach the tooltip", () => {
    const o = build(marketSpec(market));
    const helpers = o.series.filter((s) => s.stack === "__band");
    expect(helpers.map((s) => s.name)).toEqual(["__base", "__pos", "__neg"]);
  });

  it("turns the logarithmic scale on when asked", () => {
    expect(build({ ...spec, logScale: true }).yAxis["type"]).toBe("log");
  });
});

describe("stacked option", () => {
  it("draws the smallest series first so the largest sits at the bottom, and labels each at the edge", () => {
    const spec = capitalStackedSpec(dist);
    const o = build(spec);
    expect(o.series.map((s) => s.name)).toEqual([...spec.keys].reverse().map((k) => k.label));
    for (const s of o.series) expect(s.stack).toBe("capital");
  });

  it("normalises each day to 1 in percent mode", () => {
    const spec = capitalStackedSpec(dist, "percent");
    const o = build(spec);
    const days = (o.series[0]?.data ?? []).length;
    for (let d = 0; d < days; d += 10) {
      const sum = o.series.reduce((a, s) => a + ((s.data?.[d] as [string, number])[1] ?? 0), 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

describe("bars option", () => {
  it("colours diverging bars by sign", () => {
    const spec = premiumBarsSpec(market);
    const bars = (build(spec).series[0]?.data ?? []) as {
      value: number | null;
      itemStyle: { borderColor: string };
    }[];
    for (const b of bars)
      expect(b.itemStyle.borderColor).toBe((b.value ?? 0) >= 0 ? circle.good : circle.bad);
  });

  it("puts ranked bars on a horizontal value axis with the first row at the top", () => {
    const o = build(leaderboardBarsSpec(board, 5));
    expect(o.xAxis["type"]).toBe("value");
    expect(o.yAxis["type"]).toBe("category");
    expect(o.yAxis["inverse"]).toBe(true);
  });
});
