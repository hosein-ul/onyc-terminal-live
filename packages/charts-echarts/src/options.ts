import {
  formatValue,
  type CalendarSpec,
  type ChartSpec,
  type GanttSpec,
  type LorenzSpec,
  type SankeySpec,
  type ScatterSpec,
  type TreemapSpec,
  type WaterfallSpec,
} from "@onyc/chart-specs";
import { formatDate, formatPercent } from "@onyc/format";
import type { EChartsCoreOption } from "echarts/core";
import { barsOption, stackedOption, timeSeriesOption } from "./options-series.js";
import { alpha, mix, onColor, type ChartTokens } from "./tokens.js";

export interface OptionContext {
  tokens: ChartTokens;
  /** False when the visitor asked for reduced motion: nothing animates. */
  motion: boolean;
}

/** The kinds this package draws. Ordinary time series, stacked areas and bars belong to the app's main library. */
export const ECHARTS_KINDS = [
  "scatter",
  "calendar",
  "lorenz",
  "gantt",
  "treemap",
  "sankey",
  "waterfall",
  "timeseries",
  "stacked",
  "bars",
] as const;
export type EchartsKind = (typeof ECHARTS_KINDS)[number];
export const isEchartsKind = (kind: ChartSpec["kind"]): kind is EchartsKind =>
  (ECHARTS_KINDS as readonly string[]).includes(kind);

const base = (spec: ChartSpec, { tokens: t, motion }: OptionContext): Record<string, unknown> => ({
  animation: motion,
  textStyle: { fontFamily: t.fontUi },
  aria: {
    enabled: true,
    label: { description: `${spec.title}. ${spec.summary}` },
    decal: { show: false },
  },
});

const symbol = (t: ChartTokens): string => (t.marker === "rect" ? "rect" : "circle");

// -------------------------------------------------------------------------------------------------

function scatterOption(spec: ScatterSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const groups = [...new Set(spec.points.map((p) => p.group))];
  const sizes = spec.points.flatMap((p) => (p.size === undefined ? [] : [p.size]));
  const maxSize = Math.max(1, ...sizes);
  const radius = (size: number | undefined): number =>
    size === undefined ? 12 : 10 + 34 * Math.sqrt(size / maxSize);
  const guideLines = spec.guides.map((g) => ({
    ...(g.axis === "x" ? { xAxis: g.value } : { yAxis: g.value }),
    label: {
      formatter: g.label,
      position: g.axis === "x" ? "end" : "insideEndTop",
      color: t.muted,
      fontFamily: t.fontMono,
      fontSize: 11,
    },
  }));
  return {
    ...base(spec, ctx),
    grid: { left: 8, right: 24, top: 24, bottom: groups.length > 1 ? 64 : 28, containLabel: true },
    legend:
      groups.length > 1
        ? {
            type: "scroll",
            bottom: 0,
            itemWidth: 10,
            itemHeight: 10,
            icon: symbol(t) === "rect" ? "rect" : "circle",
            textStyle: { color: t.muted, fontFamily: t.fontUi, fontSize: 12 },
          }
        : undefined,
    tooltip: {
      trigger: "item",
      formatter: (p: { data: { label: string; value: [number, number]; size?: number } }) =>
        [
          `<b>${p.data.label}</b>`,
          `${spec.xLabel}: ${formatValue(p.data.value[0], spec.xUnit)}`,
          `${spec.yLabel}: ${formatValue(p.data.value[1], spec.yUnit)}`,
          ...(p.data.size !== undefined && spec.sizeLabel !== undefined
            ? [`${spec.sizeLabel}: ${formatValue(p.data.size, "usd")}`]
            : []),
        ].join("<br/>"),
    },
    xAxis: {
      type: spec.xLog ? "log" : "value",
      name: spec.xLabel,
      nameLocation: "middle",
      nameGap: 28,
      axisLabel: {
        formatter: (v: number) => formatValue(v, spec.xUnit),
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: t.grid } },
    },
    yAxis: {
      type: "value",
      name: spec.yLabel,
      axisLabel: {
        formatter: (v: number) => formatValue(v, spec.yUnit),
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: t.grid } },
    },
    series: groups.map((g, i) => ({
      type: "scatter",
      name: g,
      symbol: symbol(t),
      symbolSize: (_v: unknown, p: { data: { size?: number } }) =>
        radius(p.data.size) * (t.marker === "rect" ? 0.9 : 1),
      itemStyle: {
        color: alpha(t.series[i % t.series.length] ?? t.accent, 0.78),
        borderColor: t.surface,
        borderWidth: 1.5,
      },
      data: spec.points
        .filter((p) => p.group === g)
        .map((p) => ({
          value: [p.x, p.y],
          label: p.label,
          ...(p.size !== undefined ? { size: p.size } : {}),
        })),
      ...(i === 0 && guideLines.length > 0
        ? {
            markLine: {
              silent: true,
              symbol: "none",
              data: guideLines,
              lineStyle: { color: t.muted, type: "dashed", width: 1 },
            },
          }
        : {}),
    })),
  };
}

// -------------------------------------------------------------------------------------------------

function calendarOption(spec: CalendarSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const days = spec.days.filter((d) => d.value !== null);
  const values = days.map((d) => d.value ?? 0);
  const first = spec.days[0]?.date ?? "";
  const last = spec.days[spec.days.length - 1]?.date ?? "";
  // Colour scale from the 5th to the 95th percentile, so one outlier day does not wash out every other cell.
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
  const lowV = q(0.05);
  const highV = q(0.95) > lowV ? q(0.95) : lowV + 1;
  const weeks = Math.ceil(spec.days.length / 7) + 1;
  const wide = weeks > 26;
  const negatives = days.filter((d) => (d.value ?? 0) < 0);
  const cell = t.marker === "rect" ? 0 : 3;
  return {
    ...base(spec, ctx),
    tooltip: {
      formatter: (p: { value: [string, number] }) =>
        `${formatDate(p.value[0])}<br/>${spec.valueLabel}: <b>${formatValue(p.value[1], spec.unit)}</b>`,
    },
    visualMap: {
      show: false,
      min: lowV,
      max: highV,
      // Mono ramp: from the grid grey to ink, one cell shade per step.
      inRange: { color: [0, 0.2, 0.4, 0.6, 0.8, 1].map((k) => mix(t.grid, t.ink, k)) },
      seriesIndex: 0,
    },
    calendar: {
      range: [first, last],
      top: 28,
      left: 36,
      right: 8,
      bottom: 8,
      cellSize: wide ? ["auto", 14] : [18, 18],
      itemStyle: { color: t.grid, borderColor: t.surface, borderWidth: 3, borderRadius: 0 },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: t.muted, fontFamily: t.fontMono, fontSize: 11, nameMap: "en" },
      dayLabel: {
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 10,
        firstDay: 1,
        nameMap: ["S", "M", "T", "W", "T", "F", "S"],
      },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: days.filter((d) => (d.value ?? 0) >= 0).map((d) => [d.date, d.value]),
        itemStyle: { borderRadius: cell },
      },
      ...(negatives.length > 0
        ? [
            {
              type: "scatter",
              coordinateSystem: "calendar",
              symbol: symbol(t),
              symbolSize: 8,
              itemStyle: { color: t.bad, borderColor: t.surface, borderWidth: 1 },
              data: negatives.map((d) => [d.date, d.value]),
              z: 5,
            },
          ]
        : []),
    ],
  };
}

// -------------------------------------------------------------------------------------------------

function lorenzOption(spec: LorenzSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const pctAxis = {
    type: "value",
    min: 0,
    max: 1,
    axisLabel: {
      formatter: (v: number) => formatPercent(v, 0),
      color: t.muted,
      fontFamily: t.fontMono,
      fontSize: 11,
    },
    splitLine: { lineStyle: { color: t.grid } },
  };
  return {
    ...base(spec, ctx),
    grid: { left: 8, right: 16, top: 44, bottom: 28, containLabel: true },
    tooltip: {
      trigger: "axis",
      formatter: (ps: { value: [number, number] }[]) => {
        const v = ps[0]?.value;
        return v === undefined
          ? ""
          : `Bottom ${formatPercent(v[0], 1)} of wallets hold <b>${formatPercent(v[1], 1)}</b> of points`;
      },
    },
    xAxis: { ...pctAxis, name: "Cumulative share of wallets", nameLocation: "middle", nameGap: 28 },
    yAxis: {
      ...pctAxis,
      name: "Cumulative share of points",
      nameLocation: "end",
      nameRotate: 0,
      nameTextStyle: { align: "left", color: t.muted, fontFamily: t.fontUi, fontSize: 12 },
    },
    graphic:
      spec.gini === null
        ? []
        : [
            {
              type: "text",
              left: 72,
              top: 56,
              style: {
                text: `Gini ${spec.gini.toFixed(3)}`,
                fill: t.ink,
                font: `600 14px ${t.fontMono}`,
              },
            },
          ],
    series: [
      {
        type: "line",
        name: "Equality",
        symbol: "none",
        silent: true,
        data: [
          [0, 0],
          [1, 1],
        ],
        lineStyle: { color: t.muted, type: "dashed", width: 1 },
      },
      {
        type: "line",
        name: "Points",
        symbol: "none",
        data: spec.points.map((p) => [p.x, p.y]),
        lineStyle: { color: t.accent, width: t.stroke, cap: "round", join: "round" },
        areaStyle: { color: alpha(t.accent, 0.1) },
      },
    ],
  };
}

// -------------------------------------------------------------------------------------------------

function ganttOption(spec: GanttSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const groups = [...new Set(spec.rows.map((r) => r.group))];
  const rows = spec.rows;
  const times = rows.flatMap((r) => [Date.parse(r.start), Date.parse(r.end)]);
  const today = Date.parse(spec.today);
  const rowH = 16;
  return {
    ...base(spec, ctx),
    grid: { left: 8, right: 24, top: 36, bottom: 28, containLabel: true },
    graphic: groups.map((g, i) => ({
      type: "group",
      left: 8 + groups.slice(0, i).reduce((a, name) => a + name.length * 7 + 44, 0),
      top: 4,
      children: [
        {
          type: "rect",
          shape: { width: 10, height: 10, r: t.marker === "rect" ? 0 : 5 },
          style: { fill: t.series[i % t.series.length] },
          top: 3,
        },
        { type: "text", left: 16, style: { text: g, fill: t.muted, font: `12px ${t.fontUi}` } },
      ],
    })),
    tooltip: {
      trigger: "item",
      formatter: (p: {
        data: { value: [number, number, number]; row: GanttSpec["rows"][number] };
      }) => {
        const r = p.data.row;
        return [
          `<b>${r.label}</b>`,
          `${r.group} · ${r.status}`,
          `${formatDate(r.start)} to ${formatDate(r.end)}`,
          `Capital: ${formatValue(r.capital, "usd")}`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "time",
      min: Math.min(...times, today),
      max: Math.max(...times, today),
      position: "bottom",
      axisLabel: { color: t.muted, fontFamily: t.fontMono, fontSize: 11, hideOverlap: true },
      splitLine: { lineStyle: { color: t.grid } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => r.label),
      axisLabel: { color: t.ink, fontFamily: t.fontMono, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "custom",
        encode: { x: [1, 2], y: 0 },
        data: rows.map((r, i) => ({
          value: [i, Date.parse(r.start), Date.parse(r.end)],
          row: r,
          itemStyle: { color: t.series[groups.indexOf(r.group) % t.series.length] ?? t.accent },
        })),
        renderItem: (
          _p: unknown,
          api: {
            value: (n: number) => number;
            coord: (v: [number, number]) => [number, number];
            style: () => Record<string, unknown>;
          },
        ) => {
          const i = api.value(0);
          const start = api.coord([api.value(1), i]);
          const end = api.coord([api.value(2), i]);
          return {
            type: "rect",
            shape: {
              x: start[0],
              y: start[1] - rowH / 2,
              width: Math.max(2, end[0] - start[0]),
              height: rowH,
              r: Math.min(t.radius, rowH / 2),
            },
            style: api.style(),
          };
        },
        markLine: {
          silent: true,
          symbol: "none",
          animation: false,
          data: [
            {
              xAxis: today,
              label: {
                formatter: "today",
                position: "start",
                color: t.ink,
                fontFamily: t.fontMono,
                fontSize: 11,
              },
            },
          ],
          lineStyle: { color: t.ink, type: "solid", width: 1 },
        },
      },
    ],
  };
}

// -------------------------------------------------------------------------------------------------

function treemapOption(spec: TreemapSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const twoLevels = spec.root.some((n) => n.children !== undefined);
  const color = (i: number): string => t.series[i % t.series.length] ?? t.accent;
  return {
    ...base(spec, ctx),
    tooltip: {
      formatter: (p: {
        name: string;
        value: number;
        data: { tag?: string };
        treePathInfo: { name: string }[];
      }) =>
        [
          `<b>${p.treePathInfo
            .map((n) => n.name)
            .filter((n) => n !== "")
            .join(" / ")}</b>`,
          formatValue(p.value, spec.unit),
          ...(p.data.tag !== undefined ? [p.data.tag] : []),
        ].join("<br/>"),
    },
    series: [
      {
        type: "treemap",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        data: spec.root.map((n, i) => ({
          ...n,
          itemStyle: { color: color(i) },
          ...(twoLevels ? {} : { label: { color: onColor(color(i), t) } }),
        })),
        label: {
          show: true,
          color: t.ink,
          fontFamily: t.fontUi,
          fontSize: 12,
          formatter: (p: { name: string; value: number }) =>
            `${p.name}\n${formatValue(p.value, spec.unit)}`,
        },
        upperLabel: {
          show: twoLevels,
          height: 22,
          color: t.ink,
          fontFamily: t.fontUi,
          fontWeight: 600,
        },
        itemStyle: {
          borderColor: t.surface,
          borderWidth: 2,
          gapWidth: 2,
          borderRadius: Math.min(t.radius, 10),
        },
        levels: [
          { itemStyle: { borderColor: t.surface, borderWidth: 0, gapWidth: 4 } },
          ...(twoLevels
            ? [
                {
                  colorSaturation: [0.55, 0.8],
                  itemStyle: { gapWidth: 1, borderColorSaturation: 0.6 },
                },
              ]
            : []),
        ],
      },
    ],
  };
}

// -------------------------------------------------------------------------------------------------

function sankeyOption(spec: SankeySpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  return {
    ...base(spec, ctx),
    tooltip: {
      trigger: "item",
      formatter: (p: {
        dataType: string;
        name: string;
        value: number;
        data: { source?: string; target?: string };
      }) =>
        p.dataType === "edge"
          ? `${p.data.source} to ${p.data.target}<br/><b>${formatValue(p.value, spec.unit)}</b>`
          : `${p.name}<br/><b>${formatValue(p.value, spec.unit)}</b>`,
    },
    series: [
      {
        type: "sankey",
        left: 8,
        right: 120,
        top: 8,
        bottom: 8,
        nodeAlign: "left",
        nodeWidth: 14,
        nodeGap: 8,
        emphasis: { focus: "adjacency" },
        data: spec.nodes.map((n, i) => ({
          name: n.label,
          itemStyle: { color: t.series[i % t.series.length], borderColor: t.surface },
        })),
        links: spec.links.map((l) => ({
          source: spec.nodes.find((n) => n.id === l.source)?.label ?? l.source,
          target: spec.nodes.find((n) => n.id === l.target)?.label ?? l.target,
          value: l.value,
        })),
        lineStyle: { color: "source", opacity: 0.28, curveness: 0.5 },
        label: { color: t.ink, fontFamily: t.fontUi, fontSize: 12 },
      },
    ],
  };
}

// -------------------------------------------------------------------------------------------------

function waterfallOption(spec: WaterfallSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  let running = 0;
  const bars = spec.steps.map((s, i) => {
    const from = s.type === "total" ? 0 : running;
    const to = s.type === "total" ? s.value : running + s.value;
    if (s.type === "delta") running += s.value;
    // Mono: increases are pale ink, decreases are outlined, the total is solid ink.
    const itemStyle =
      s.type === "total"
        ? { color: t.ink }
        : s.value >= 0
          ? { color: alpha(t.ink, 0.22) }
          : { color: t.surface, borderColor: t.ink, borderWidth: 1.5 };
    return { value: [i, from, to] as [number, number, number], step: s, itemStyle };
  });
  const lo = Math.min(0, ...bars.flatMap((b) => [b.value[1], b.value[2]]));
  const hi = Math.max(0, ...bars.flatMap((b) => [b.value[1], b.value[2]]));
  return {
    ...base(spec, ctx),
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p: { data: { step: WaterfallSpec["steps"][number] } }) =>
        `${p.data.step.label}<br/><b>${formatValue(p.data.step.value, spec.unit)}</b>`,
    },
    xAxis: {
      type: "category",
      data: spec.steps.map((s) => s.label),
      axisLabel: {
        color: t.ink,
        fontFamily: t.fontUi,
        fontSize: 11,
        interval: 0,
        width: 62,
        overflow: "break",
      },
      axisLine: { lineStyle: { color: t.line } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: lo,
      max: hi * 1.12,
      axisLabel: {
        formatter: (v: number) => formatValue(v, spec.unit),
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
      },
      splitLine: { lineStyle: { color: t.grid } },
    },
    series: [
      {
        type: "custom",
        data: bars,
        encode: { x: 0, y: [1, 2] },
        renderItem: (
          _p: unknown,
          api: {
            value: (n: number) => number;
            coord: (v: [number, number]) => [number, number];
            size: (v: [number, number]) => [number, number];
            style: () => Record<string, unknown>;
          },
        ) => {
          const i = api.value(0);
          const a = api.coord([i, api.value(1)]);
          const b = api.coord([i, api.value(2)]);
          const width = Math.min(44, api.size([1, 0])[0] * 0.4);
          const top = Math.min(a[1], b[1]);
          const next = api.coord([i + 1, api.value(2)]);
          const delta = api.value(2) - api.value(1);
          return {
            type: "group",
            children: [
              // A thin dashed link carries the running level into the next bar.
              ...(i < spec.steps.length - 1
                ? [
                    {
                      type: "line",
                      shape: { x1: a[0] + width / 2, y1: b[1], x2: next[0] - width / 2, y2: b[1] },
                      style: { stroke: t.muted, lineWidth: 1, lineDash: [3, 3], opacity: 0.6 },
                    },
                  ]
                : []),
              {
                type: "rect",
                shape: {
                  x: a[0] - width / 2,
                  y: top,
                  width,
                  height: Math.max(2, Math.abs(a[1] - b[1])),
                  r: Math.min(t.radius, 8),
                },
                style: api.style(),
              },
              {
                type: "text",
                style: {
                  x: a[0],
                  y: top - 8,
                  text: formatValue(delta === 0 ? api.value(2) : delta, spec.unit),
                  textAlign: "center",
                  textVerticalAlign: "bottom",
                  fill: delta === 0 ? t.muted : t.ink,
                  font: `600 12px ${t.fontUi}`,
                },
              },
            ],
          };
        },
        label: { show: false },
      },
    ],
  };
}

// -------------------------------------------------------------------------------------------------

/** Build the full ECharts option for a spec of one of the kinds this package draws. */
export function optionFor(spec: ChartSpec, ctx: OptionContext): EChartsCoreOption {
  switch (spec.kind) {
    case "scatter":
      return scatterOption(spec, ctx);
    case "calendar":
      return calendarOption(spec, ctx);
    case "lorenz":
      return lorenzOption(spec, ctx);
    case "gantt":
      return ganttOption(spec, ctx);
    case "treemap":
      return treemapOption(spec, ctx);
    case "sankey":
      return sankeyOption(spec, ctx);
    case "waterfall":
      return waterfallOption(spec, ctx);
    case "timeseries":
      return timeSeriesOption(spec, ctx);
    case "stacked":
      return stackedOption(spec, ctx);
    case "bars":
      return barsOption(spec, ctx);
    default:
      throw new Error(`charts-echarts does not draw "${spec.kind}"; draw it as SVG in the app`);
  }
}
