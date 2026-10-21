import { readFileSync } from "node:fs";
import type { EndpointResponse } from "@onyc/sdk";
import { describe, expect, it } from "vitest";
import {
  axisFormatter,
  capitalStackBarSpec,
  capitalStackedSpec,
  capitalTreemapSpec,
  collateralBulletSpec,
  collateralSankeySpec,
  coverageBulletSpec,
  layersBubbleSpec,
  layersGanttSpec,
  leaderboardBarsSpec,
  lorenzSpec,
  marketSpec,
  navCalendarSpec,
  navSpec,
  orderX,
  opportunitiesScatterSpec,
  opportunityMultiplesSpec,
  premiumBarsSpec,
  provenanceFrom,
  renewalBarsSpec,
  reservesTreemapSpec,
  specToCsv,
  specToTable,
  tableToCsv,
  tooltipHeading,
  waterfallSpec,
  type ChartSpec,
} from "./index.js";

// Real responses saved from the running API (see fixtures/); the builders are tested on them, not on made-up data.
const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as T;

const nav = load<EndpointResponse<"nav">>("nav");
const market = load<EndpointResponse<"market">>("market");
const flows = load<EndpointResponse<"flows">>("flows");
const layers = load<EndpointResponse<"reinsuranceLayers">>("layers");
const summary = load<EndpointResponse<"reinsuranceSummary">>("reinsurance_summary");
const stack = load<EndpointResponse<"capitalStack">>("capital_stack");
const dist = load<EndpointResponse<"capitalDistribution">>("capital_distribution");
const opps = load<EndpointResponse<"defiOpportunities">>("opportunities");
const conc = load<EndpointResponse<"concentration">>("concentration");
const board = load<EndpointResponse<"leaderboard">>("leaderboard");
const solvency = load<EndpointResponse<"solvency">>("solvency");
const yieldRes = load<EndpointResponse<"yieldComposition">>("yield");

describe("provenanceFrom", () => {
  it("reports the oldest fetch and any staleness", () => {
    const p = provenanceFrom(
      {
        a: { source: "A", fetchedAt: "2026-10-21T10:00:00.000Z", stale: false },
        b: { source: "B", fetchedAt: "2026-10-21T08:00:00.000Z", stale: true },
      },
      "a",
      "b",
    );
    expect(p).toEqual({ source: "A + B", fetchedAt: "2026-10-21T08:00:00.000Z", stale: true });
  });
  it("is unknown and stale when nothing matches", () => {
    expect(provenanceFrom({}, "x")).toMatchObject({ fetchedAt: null, stale: true });
  });
  it("has no fetch time if any input was never fetched", () => {
    const p = provenanceFrom(
      {
        a: { source: "A", fetchedAt: "2026-10-21T10:00:00.000Z", stale: false },
        b: { source: "A", fetchedAt: null, stale: true },
      },
      "a",
      "b",
    );
    expect(p.fetchedAt).toBeNull();
    expect(p.source).toBe("A");
  });
});

describe("navSpec", () => {
  const spec = navSpec(nav);
  it("draws every NAV row and marks the end", () => {
    expect(spec.series[0]?.points).toHaveLength(nav.data.series.length);
    const end = spec.annotations.find((a) => a.kind === "end");
    const last = nav.data.series[nav.data.series.length - 1];
    expect(end).toMatchObject({ x: last?.date, y: last?.nav });
  });
  it("marks each down-tick as a bad event placed on the NAV value of that day", () => {
    const downticks = nav.data.events.filter((e) => e.reason === "downtick");
    const marks = spec.annotations.filter((a) => a.kind === "event" && a.tone === "bad");
    expect(marks).toHaveLength(downticks.length);
    expect(downticks.length).toBeGreaterThan(0);
    for (const m of marks) {
      if (m.kind !== "event") continue;
      expect(m.y).toBe(nav.data.series.find((r) => r.date === m.x)?.nav);
    }
  });
  it("is never smoothed, carries provenance and states missing dates", () => {
    expect(spec.smooth).toBe(false);
    expect(spec.provenance.source.length).toBeGreaterThan(0);
    expect(spec.note).toContain("missing");
    expect(spec.summary).toContain("down-tick");
  });
});

describe("market specs", () => {
  it("shades the spread between market price and NAV", () => {
    const spec = marketSpec(market);
    expect(spec.spread).toEqual({ a: "market", b: "nav" });
    expect(spec.series).toHaveLength(2);
  });
  it("draws premium bars coloured by sign with symmetric thresholds", () => {
    const spec = premiumBarsSpec(market);
    for (const b of spec.bars) expect(b.tone).toBe((b.value ?? 0) >= 0 ? "good" : "bad");
    expect(spec.thresholds.map((t) => t.y).sort((a, b) => a - b)).toEqual([
      -100, -50, -25, 25, 50, 100,
    ]);
  });
  it("says so instead of drawing when history is too short", () => {
    const short = structuredClone(market);
    short.data.history = short.data.history.slice(0, 1);
    expect(marketSpec(short).empty).toBeDefined();
  });
});

describe("waterfallSpec", () => {
  it("ends on the sum of its deltas", () => {
    const spec = waterfallSpec(flows);
    const deltas = spec.steps.filter((s) => s.type === "delta").reduce((a, s) => a + s.value, 0);
    expect(spec.steps.at(-1)?.value).toBeCloseTo(deltas, 6);
  });
});

describe("capital specs", () => {
  it("orders stack keys by current size, largest first", () => {
    const spec = capitalStackedSpec(dist);
    const sizes = spec.keys.map(
      (k) => dist.data.distribution.find((d) => d.protocol === k.key)?.capitalUsd ?? 0,
    );
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(spec.rows.length).toBeGreaterThan(1);
    expect(spec.rows.map((r) => r.x)).toEqual([...spec.rows.map((r) => r.x)].sort());
  });
  it("percent mode uses the pct unit", () => {
    expect(capitalStackedSpec(dist, "percent").unit).toBe("pct");
  });
  it("shows the capital stack sum check, and it holds on real data", () => {
    const spec = capitalStackBarSpec(stack);
    expect(spec).not.toBeNull();
    expect(spec?.sumCheck.ok).toBe(true);
    expect(spec?.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(spec?.total.value ?? 0, 0);
    expect(spec?.note).toContain("policy share");
  });
  it("has no stack bar when the API has no stack", () => {
    expect(capitalStackBarSpec({ data: { stack: null, note: "" }, meta: stack.meta })).toBeNull();
  });
  it("builds one-level and two-level treemaps", () => {
    expect(capitalTreemapSpec(dist).root).toHaveLength(dist.data.distribution.length);
    const t = reservesTreemapSpec(solvency);
    expect(t.root[0]?.children?.length).toBeGreaterThan(0);
  });
  it("conserves value through the collateral sankey", () => {
    const spec = collateralSankeySpec(yieldRes);
    const fromTotal = spec.links
      .filter((l) => l.source === "total")
      .reduce((a, l) => a + l.value, 0);
    const toAssets = spec.links
      .filter((l) => l.target.startsWith("a:"))
      .reduce((a, l) => a + l.value, 0);
    expect(fromTotal).toBeCloseTo(toAssets, 2);
    for (const l of spec.links) {
      expect(spec.nodes.some((n) => n.id === l.source)).toBe(true);
      expect(spec.nodes.some((n) => n.id === l.target)).toBe(true);
    }
  });
});

describe("reinsurance specs", () => {
  it("has one gantt row per layer, ordered by inception, with end after start", () => {
    const spec = layersGanttSpec(layers, new Date("2026-10-21T12:00:00Z"));
    expect(spec.rows).toHaveLength(layers.data.layers.length);
    expect(spec.today).toBe("2026-10-21");
    for (const r of spec.rows) expect(r.end >= r.start).toBe(true);
    expect(spec.rows.map((r) => r.start)).toEqual([...spec.rows.map((r) => r.start)].sort());
  });
  it("draws only layers with an expected loss ratio, and notes the rest", () => {
    const spec = layersBubbleSpec(layers);
    const withRatio = layers.data.layers.filter((l) => l.expectedLossRatio !== null).length;
    expect(spec.points).toHaveLength(withRatio);
    if (withRatio < layers.data.layers.length) expect(spec.note).toBeDefined();
    expect(spec.guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
  });
  it("sorts renewal months and keeps the capital", () => {
    const spec = renewalBarsSpec(summary);
    expect(spec.bars.map((b) => b.label)).toEqual([...spec.bars.map((b) => b.label)].sort());
    expect(spec.bars.reduce((a, b) => a + (b.value ?? 0), 0)).toBeCloseTo(
      summary.data.renewalCalendar.reduce((a, r) => a + r.capital, 0),
      0,
    );
  });
});

describe("points and DeFi specs", () => {
  it("starts the Lorenz curve at the origin and carries the Gini", () => {
    const spec = lorenzSpec(conc);
    expect(spec.points[0]).toEqual({ x: 0, y: 0 });
    expect(spec.gini).toBe(conc.data.gini);
  });
  it("takes the top N leaderboard rows with shortened addresses", () => {
    const spec = leaderboardBarsSpec(board, 5);
    expect(spec.bars).toHaveLength(5);
    expect(spec.bars[0]?.label).toMatch(/^#1 .{4}….{4}$/);
  });
  it("puts only opportunities with both APY and TVL on the log scatter", () => {
    const spec = opportunitiesScatterSpec(opps);
    expect(spec.xLog).toBe(true);
    for (const p of spec.points) expect(p.x).toBeGreaterThan(0);
    expect(spec.points.length).toBeLessThan(opps.data.opportunities.length);
    expect(spec.note).toBeDefined();
  });
  it("shows an honest empty state for APY history that has not been collected", () => {
    const spec = opportunityMultiplesSpec(opps);
    if (spec.items.length === 0) expect(spec.empty).toContain("not yet");
  });
  it("calendar keeps null increments as null, not zero", () => {
    const spec = navCalendarSpec(nav);
    expect(spec.days).toHaveLength(nav.data.series.length);
    expect(spec.days[0]?.value).toBeNull();
  });
});

describe("bullets", () => {
  it("scales past the value and names the target", () => {
    const b = coverageBulletSpec(market);
    expect(b.max).toBeGreaterThan(b.value ?? 0);
    expect(b.target?.value).toBe(0.15);
  });
  it("shows not available rather than a number when the value is missing", () => {
    const m = structuredClone(market);
    m.data.liquidityCoverage = null;
    const b = coverageBulletSpec(m);
    expect(b.value).toBeNull();
    expect(b.valueLabel).toBe("—");
    const s = structuredClone(solvency);
    s.data.collateralization = null;
    expect(collateralBulletSpec(s).value).toBeNull();
  });
});

describe("table and CSV", () => {
  it("every spec builds a table and a CSV whose rows match the table", () => {
    const specs: ChartSpec[] = [
      navSpec(nav),
      marketSpec(market),
      premiumBarsSpec(market),
      waterfallSpec(flows),
      capitalStackedSpec(dist),
      capitalStackBarSpec(stack) as ChartSpec,
      capitalTreemapSpec(dist),
      reservesTreemapSpec(solvency),
      collateralSankeySpec(yieldRes),
      layersGanttSpec(layers),
      layersBubbleSpec(layers),
      renewalBarsSpec(summary),
      navCalendarSpec(nav),
      lorenzSpec(conc),
      leaderboardBarsSpec(board),
      opportunitiesScatterSpec(opps),
      opportunityMultiplesSpec(opps),
      coverageBulletSpec(market),
    ];
    for (const spec of specs) {
      const table = specToTable(spec);
      const csv = specToCsv(spec);
      expect(csv.split("\r\n").length - 1, spec.id).toBe(table.rows.length + 1);
      for (const row of table.rows) expect(row, spec.id).toHaveLength(table.columns.length);
    }
  });
  it("joins series on date and leaves gaps empty", () => {
    const table = specToTable(navSpec(nav));
    expect(table.columns.map((c) => c.label)).toEqual(["date", "NAV"]);
    expect(table.rows[0]?.[0]).toBe(nav.data.series[0]?.date);
  });
  it("quotes commas, quotes and newlines and keeps raw numbers", () => {
    const csv = tableToCsv({
      columns: [{ label: "a,b" }, { label: "v" }],
      rows: [
        ['say "hi"', 1.23456789],
        ["x\ny", null],
      ],
    });
    expect(csv).toBe('"a,b",v\r\n"say ""hi""",1.23456789\r\n"x\ny",\r\n');
  });
});

describe("axisFormatter", () => {
  it("shows times for data within three days, dates otherwise, and passes relative labels through", () => {
    const intraday = axisFormatter(["2026-10-21T08:00:00.000Z", "2026-10-21T15:28:00.000Z"]);
    expect(intraday("2026-10-21T15:28:00.000Z")).toBe("15:28 UTC");
    const daily = axisFormatter(["2026-07-23", "2026-10-21"]);
    expect(daily("2026-10-21")).toBe("21 Oct 2026");
    expect(daily("day -3")).toBe("day -3");
  });
  it("heads tooltips with the time only when the value has one", () => {
    expect(tooltipHeading("2026-10-21")).toBe("21 Oct 2026");
    expect(tooltipHeading("2026-10-21T15:28:00.000Z")).toContain("15:28");
  });
});

describe("orderX", () => {
  it("sorts dates and keeps relative labels in arrival order", () => {
    expect(orderX(["2026-02-01", "2026-01-01"])).toEqual(["2026-01-01", "2026-02-01"]);
    expect(orderX(["day -2", "day -10", "day -1"])).toEqual(["day -2", "day -10", "day -1"]);
  });
});
