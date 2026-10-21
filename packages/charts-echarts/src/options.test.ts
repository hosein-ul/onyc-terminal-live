import { readFileSync } from "node:fs";
import {
  collateralSankeySpec,
  layersBubbleSpec,
  layersGanttSpec,
  lorenzSpec,
  navCalendarSpec,
  opportunitiesScatterSpec,
  reservesTreemapSpec,
  capitalTreemapSpec,
  waterfallSpec,
  type ChartSpec,
} from "@onyc/chart-specs";
import type { EndpointResponse } from "@onyc/sdk";
import { describe, expect, it } from "vitest";
import { isEchartsKind, optionFor } from "./options.js";
import { makeTheme } from "./theme.js";
import { alpha, contrast, mix, onColor, ramp, type ChartTokens } from "./tokens.js";

const tokens: ChartTokens = {
  ground: "#12151b",
  surface: "#1a1f27",
  ink: "#f1f4f8",
  muted: "#8c97a8",
  line: "#232933",
  grid: "#232933",
  accent: "#8fb4ff",
  good: "#8fb4ff",
  bad: "#ff8fa3",
  series: ["#8fb4ff", "#c9d1db", "#5f8fe0", "#6e7a8e", "#a7c4ff", "#3e4a5e", "#e3e8ef"],
  fontUi: "Outfit",
  fontMono: "Geist Mono",
  stroke: 2.5,
  radius: 6,
  tooltipBg: "#0d1015",
  tooltipInk: "#f1f4f8",
  marker: "circle",
};

// Real API responses saved by the chart-specs package.
const load = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../chart-specs/fixtures/${name}.json`, import.meta.url), "utf8"),
  ) as T;

const layers = load<EndpointResponse<"reinsuranceLayers">>("layers");
const nav = load<EndpointResponse<"nav">>("nav");
const conc = load<EndpointResponse<"concentration">>("concentration");
const opps = load<EndpointResponse<"defiOpportunities">>("opportunities");
const yieldRes = load<EndpointResponse<"yieldComposition">>("yield");
const solvency = load<EndpointResponse<"solvency">>("solvency");
const dist = load<EndpointResponse<"capitalDistribution">>("capital_distribution");
const flows = load<EndpointResponse<"flows">>("flows");

const specs: ChartSpec[] = [
  layersGanttSpec(layers),
  layersBubbleSpec(layers),
  navCalendarSpec(nav),
  lorenzSpec(conc),
  opportunitiesScatterSpec(opps),
  collateralSankeySpec(yieldRes),
  reservesTreemapSpec(solvency),
  capitalTreemapSpec(dist),
  waterfallSpec(flows),
];

type Option = {
  animation: boolean;
  aria: { label: { description: string } };
  series: { type: string; data?: unknown[] }[];
};
const build = (spec: ChartSpec, motion = true): Option =>
  optionFor(spec, { tokens, motion }) as unknown as Option;

describe("optionFor", () => {
  it("builds an option for every complex kind, each with an accessible description and series", () => {
    for (const spec of specs) {
      const option = build(spec);
      expect(isEchartsKind(spec.kind), spec.id).toBe(true);
      expect(option.aria.label.description, spec.id).toContain(spec.title);
      expect(option.series.length, spec.id).toBeGreaterThan(0);
    }
  });

  it("stops all animation when motion is off", () => {
    for (const spec of specs) expect(build(spec, false).animation, spec.id).toBe(false);
    expect(build(specs[0] as ChartSpec, true).animation).toBe(true);
  });

  it("refuses kinds that belong to the app's main library", () => {
    const bars = { ...specs[0], kind: "bars" } as unknown as ChartSpec;
    expect(isEchartsKind("bars")).toBe(false);
    expect(() => optionFor(bars, { tokens, motion: true })).toThrow(/main chart library/);
  });

  it("draws one Gantt bar per layer and one scatter series per group", () => {
    const gantt = build(layersGanttSpec(layers));
    expect(gantt.series[0]?.data).toHaveLength(layers.data.layers.length);
    const bubble = layersBubbleSpec(layers);
    expect(build(bubble).series).toHaveLength(new Set(bubble.points.map((p) => p.group)).size);
  });

  it("marks negative NAV-increment days in a separate series", () => {
    const calendar = navCalendarSpec(nav);
    const negatives = calendar.days.filter((d) => (d.value ?? 0) < 0).length;
    const option = build(calendar);
    expect(option.series[0]?.type).toBe("heatmap");
    if (negatives > 0) expect(option.series[1]?.data).toHaveLength(negatives);
  });

  it("anchors the waterfall total at zero and sums the deltas", () => {
    const spec = waterfallSpec(flows);
    const bars = build(spec).series[0]?.data as { value: [number, number, number] }[];
    const total = bars[bars.length - 1];
    expect(total?.value[1]).toBe(0);
    expect(total?.value[2]).toBeCloseTo(spec.steps[spec.steps.length - 1]?.value ?? NaN, 4);
  });
});

describe("makeTheme", () => {
  it("carries the app's palette, fonts and tooltip skin, and no animation longer than 300 ms", () => {
    const theme = makeTheme(tokens) as {
      color: string[];
      textStyle: { fontFamily: string };
      animationDuration: number;
      tooltip: { backgroundColor: string };
    };
    expect(theme.color).toEqual(tokens.series);
    expect(theme.textStyle.fontFamily).toBe("Outfit");
    expect(theme.tooltip.backgroundColor).toBe("#0d1015");
    expect(theme.animationDuration).toBeLessThanOrEqual(300);
  });
});

describe("colour helpers", () => {
  it("mixes and applies alpha", () => {
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mix("#102030", "#102030", 0.7)).toBe("#102030");
    expect(alpha("#ff0000", 0.5)).toBe("rgba(255,0,0,0.5)");
    expect(ramp(tokens, 5)).toHaveLength(5);
    expect(ramp(tokens, 5)[4]).toBe(tokens.accent);
  });
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("picks readable text on both light and dark skins", () => {
    const dark = tokens;
    const light: ChartTokens = { ...tokens, ink: "#101828", surface: "#ffffff" };
    for (const t of [dark, light]) {
      for (const bg of t.series)
        expect(contrast(bg, onColor(bg, t)), `${bg} on ${t.ink}`).toBeGreaterThanOrEqual(3);
    }
    expect(onColor("#c9d1db", dark)).toBe(dark.surface); // light fill on the dark skin gets dark text
    expect(onColor("#0b6bcb", light)).toBe(light.surface); // dark fill on the light skin gets light text
  });
});
