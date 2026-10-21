/**
 * ECharts options for the ordinary chart kinds (time series, stacked areas, bars). The apps whose main library is
 * Recharts or Tremor never call these; Dot Matrix draws every chart through them. The skin decides the look: square
 * markers (`marker: "rect"`) switch on step lines and dotted-pattern fills.
 */
import {
  axisFormatter,
  formatValue,
  tooltipHeading,
  type BarsSpec,
  type StackedSpec,
  type TimeSeriesSpec,
} from "@onyc/chart-specs";
import { formatMonthYear } from "@onyc/format";
import type { EChartsCoreOption } from "echarts/core";
import type { OptionContext } from "./options.js";
import { alpha, type ChartTokens } from "./tokens.js";

const isIso = (x: string): boolean => /^\d{4}-\d{2}-\d{2}/.test(x);
const square = (t: ChartTokens): boolean => t.marker === "rect";

/** Dotted fill used by the square (Dot Matrix) skin in place of a translucent area. */
function dotFill(color: string): Record<string, unknown> {
  return {
    symbol: "circle",
    symbolSize: 1,
    dashArrayX: 6,
    dashArrayY: 6,
    rotation: 0,
    color,
  };
}

const base = (
  spec: { title: string; summary: string },
  { tokens: t, motion }: OptionContext,
): Record<string, unknown> => ({
  animation: motion,
  textStyle: { fontFamily: t.fontUi },
  aria: {
    enabled: true,
    label: { description: `${spec.title}. ${spec.summary}` },
    decal: { show: square(t) },
  },
});

function axisPointerTooltip(
  t: ChartTokens,
  unit: TimeSeriesSpec["unit"],
  hide: string[] = [],
): Record<string, unknown> {
  return {
    trigger: "axis",
    axisPointer: { type: "line", lineStyle: { color: t.muted, type: "dashed" } },
    formatter: (
      params: {
        axisValue: number | string;
        axisValueLabel?: string;
        seriesName: string;
        value: unknown;
        color: string;
      }[],
    ) => {
      const first = params[0];
      if (first === undefined) return "";
      const key =
        typeof first.axisValue === "number"
          ? new Date(first.axisValue).toISOString()
          : String(first.axisValue);
      const rows = params
        .filter((p) => !hide.includes(p.seriesName) && !p.seriesName.startsWith("__"))
        .map((p) => {
          const v: unknown = Array.isArray(p.value) ? (p.value as unknown[])[1] : p.value;
          return typeof v === "number" ? `${p.seriesName}: <b>${formatValue(v, unit)}</b>` : "";
        })
        .filter((r) => r !== "");
      return [isIso(key) ? tooltipHeading(key) : key, ...rows].join("<br/>");
    },
  };
}

export function timeSeriesOption(spec: TimeSeriesSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const xs = spec.series.flatMap((s) => s.points.map((p) => p.x));
  const time = xs.every(isIso);
  const compact = spec.compact === true;
  const step = square(t) ? "end" : false;
  const primary = spec.series.find((s) => s.role === "primary") ?? spec.series[0];
  const fmtX = axisFormatter(xs);

  const ys = spec.series.flatMap((s) => s.points.flatMap((p) => (p.y === null ? [] : [p.y])));
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.01 || 1;

  const lines = spec.series.map((s) => {
    const isPrimary = s === primary;
    const data = s.points.map((p) => [p.x, p.y]);
    const filled = spec.variant === "area" && isPrimary;
    return {
      type: "line",
      name: s.label,
      step,
      smooth: false,
      showSymbol: false,
      connectNulls: true,
      data,
      lineStyle: {
        width: s.role === "primary" ? (compact ? 2 : t.stroke) : 1.5,
        color: s.role === "primary" ? t.accent : s.role === "secondary" ? t.ink : t.muted,
        type: s.role === "reference" ? "dashed" : "solid",
        cap: "round",
        join: "round",
      },
      itemStyle: {
        color: s.role === "primary" ? t.accent : t.muted,
        ...(filled && square(t) ? { decal: dotFill(t.accent) } : {}),
      },
      ...(filled
        ? {
            areaStyle: square(t)
              ? { color: alpha(t.accent, 0.04) }
              : {
                  color: {
                    type: "linear",
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: alpha(t.accent, 0.22) },
                      { offset: 1, color: alpha(t.accent, 0) },
                    ],
                  },
                },
          }
        : {}),
      ...(isPrimary
        ? {
            markPoint: {
              animation: false,
              symbol: square(t) ? "rect" : "circle",
              data: spec.annotations.flatMap((a): Record<string, unknown>[] =>
                a.kind === "event" && a.y !== null
                  ? [
                      {
                        coord: [a.x, a.y],
                        symbolSize: 9,
                        itemStyle: {
                          color: t.surface,
                          borderColor: a.tone === "bad" ? t.bad : t.muted,
                          borderWidth: 2,
                        },
                        label: { show: false },
                        name: a.label,
                      },
                    ]
                  : a.kind === "end"
                    ? [
                        {
                          coord: [a.x, a.y],
                          symbolSize: 11,
                          itemStyle: { color: t.accent, borderColor: t.surface, borderWidth: 2 },
                          label: {
                            show: true,
                            formatter: a.label,
                            position: "right",
                            distance: 8,
                            color: t.ink,
                            fontFamily: t.fontMono,
                            fontWeight: 600,
                            fontSize: 12,
                          },
                        },
                      ]
                    : [],
              ),
            },
            markLine: {
              silent: true,
              symbol: "none",
              animation: false,
              data: spec.annotations.flatMap((a) =>
                a.kind === "threshold"
                  ? [
                      {
                        yAxis: a.y,
                        label: {
                          formatter: a.label,
                          color: t.muted,
                          fontFamily: t.fontMono,
                          fontSize: 11,
                        },
                        lineStyle: { color: t.muted, type: "dashed" },
                      },
                    ]
                  : [],
              ),
            },
          }
        : {}),
    };
  });

  // Shade the gap between two series by the sign of the spread: premium one way, discount the other.
  const band = (() => {
    if (spec.spread === undefined) return [];
    const a = new Map(
      spec.series.find((s) => s.key === spec.spread?.a)?.points.map((p) => [p.x, p.y] as const),
    );
    const b = new Map(
      spec.series.find((s) => s.key === spec.spread?.b)?.points.map((p) => [p.x, p.y] as const),
    );
    const keys = [...a.keys()].filter((k) => a.get(k) != null && b.get(k) != null);
    const mk = (
      name: string,
      color: string,
      pick: (hi: number, lo: number, up: boolean) => number,
    ): Record<string, unknown> => ({
      type: "line",
      name,
      stack: "__band",
      step,
      showSymbol: false,
      silent: true,
      lineStyle: { width: 0 },
      areaStyle:
        name === "__base"
          ? { color: "transparent" }
          : { color: alpha(color, 0.25), ...(square(t) ? { decal: dotFill(color) } : {}) },
      data: keys.map((k) => {
        const x = a.get(k) as number;
        const y = b.get(k) as number;
        return [k, pick(Math.max(x, y), Math.min(x, y), x >= y)];
      }),
    });
    return [
      mk("__base", "transparent", (_hi, lo) => lo),
      mk("__pos", t.good, (hi, lo, up) => (up ? hi - lo : 0)),
      mk("__neg", t.bad, (hi, lo, up) => (up ? 0 : hi - lo)),
    ];
  })();

  return {
    ...base(spec, ctx),
    grid: compact
      ? { left: 2, right: 2, top: 4, bottom: 2 }
      : {
          left: 8,
          right: spec.annotations.some((a) => a.kind === "end") ? 72 : 16,
          top: 16,
          bottom: 8,
          containLabel: true,
        },
    tooltip: compact
      ? { show: false }
      : axisPointerTooltip(t, spec.unit, ["__base", "__pos", "__neg"]),
    xAxis: {
      type: time ? "time" : "category",
      show: !compact,
      boundaryGap: false,
      axisLabel: {
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
        hideOverlap: true,
        formatter: (v: number | string) =>
          fmtX(typeof v === "number" ? new Date(v).toISOString() : v),
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: spec.logScale === true ? "log" : "value",
      show: !compact,
      scale: !spec.zeroBased,
      ...(spec.zeroBased || spec.logScale === true ? {} : { min: lo - pad, max: hi + pad }),
      splitNumber: 4,
      axisLabel: {
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
        formatter: (v: number) => formatValue(v, spec.unit),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: !compact,
        lineStyle: { color: t.grid, type: square(t) ? "dashed" : "solid" },
      },
    },
    series: [...band, ...lines],
  };
}

export function stackedOption(spec: StackedSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const percent = spec.mode === "percent";
  const keys = [...spec.keys].reverse(); // largest first in the spec; drawn from the bottom up
  const time = spec.rows.every((r) => isIso(r.x));
  const fmtX = axisFormatter(spec.rows.map((r) => r.x));
  const unit = percent ? "pct" : spec.unit;
  return {
    ...base(spec, ctx),
    grid: { left: 8, right: 118, top: 12, bottom: 8, containLabel: true },
    tooltip: axisPointerTooltip(t, unit),
    xAxis: {
      type: time ? "time" : "category",
      boundaryGap: false,
      axisLabel: {
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
        hideOverlap: true,
        formatter: (v: number | string) =>
          fmtX(typeof v === "number" ? new Date(v).toISOString() : v),
      },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      max: percent ? 1 : undefined,
      axisLabel: {
        color: t.muted,
        fontFamily: t.fontMono,
        fontSize: 11,
        formatter: (v: number) => formatValue(v, unit),
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.grid, type: square(t) ? "dashed" : "solid" } },
    },
    series: keys.map((k, i) => {
      const color = t.series[(keys.length - 1 - i) % t.series.length] ?? t.accent;
      return {
        type: "line",
        name: k.label,
        stack: "capital",
        step: square(t) ? "end" : false,
        showSymbol: false,
        data: spec.rows.map((r) => {
          const total = percent ? Object.values(r.values).reduce((a, b) => a + b, 0) || 1 : 1;
          return [r.x, (r.values[k.key] ?? 0) / total];
        }),
        lineStyle: { width: 1, color: t.surface },
        itemStyle: { color, ...(square(t) ? { decal: dotFill(color) } : {}) },
        areaStyle: square(t) ? { color: alpha(color, 0.35) } : { color, opacity: 0.94 },
        emphasis: { disabled: true },
        labelLayout: { moveOverlap: "shiftY" },
        endLabel: {
          show: true,
          formatter: k.label,
          color: t.ink,
          fontFamily: t.fontUi,
          fontSize: 12,
          distance: 8,
        },
      };
    }),
  };
}

export function barsOption(spec: BarsSpec, ctx: OptionContext): EChartsCoreOption {
  const t = ctx.tokens;
  const horizontal = spec.orientation === "horizontal";
  const labels = spec.bars.map((b) => b.label);
  const fmtX = axisFormatter(labels);
  const label = (v: string): string =>
    /^\d{4}-\d{2}$/.test(v) ? formatMonthYear(v) : isIso(v) ? fmtX(v) : v;
  const color = (b: BarsSpec["bars"][number]): string =>
    spec.diverging ? ((b.value ?? 0) >= 0 ? t.good : t.bad) : b.tone === "bad" ? t.bad : t.accent;
  const radius = Math.min(t.radius, 8);
  const valueAxis = {
    type: "value",
    axisLabel: {
      color: t.muted,
      fontFamily: t.fontMono,
      fontSize: 11,
      formatter: (v: number) => formatValue(v, spec.unit),
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: t.grid, type: square(t) ? "dashed" : "solid" } },
  };
  const categoryAxis = {
    type: "category",
    data: labels,
    inverse: horizontal,
    axisLabel: {
      color: horizontal ? t.ink : t.muted,
      fontFamily: horizontal ? t.fontUi : t.fontMono,
      fontSize: 11,
      hideOverlap: true,
      formatter: label,
    },
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
  };
  return {
    ...base(spec, ctx),
    grid: { left: 8, right: horizontal ? 64 : 12, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (ps: { axisValue: string; value: number }[]) => {
        const p = ps[0];
        return p === undefined
          ? ""
          : `${isIso(p.axisValue) ? tooltipHeading(p.axisValue) : p.axisValue}<br/><b>${formatValue(p.value, spec.unit)}</b>`;
      },
    },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: [
      {
        type: "bar",
        name: spec.title,
        barMaxWidth: horizontal ? 18 : 40,
        data: spec.bars.map((b) => ({
          value: b.value,
          itemStyle: {
            color: square(t) ? alpha(color(b), 0.55) : color(b),
            borderColor: color(b),
            borderWidth: square(t) ? 1.5 : 0,
            borderRadius: horizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0],
            ...(square(t) ? { decal: dotFill(color(b)) } : {}),
          },
        })),
        label: horizontal
          ? {
              show: true,
              position: "right",
              color: t.ink,
              fontFamily: t.fontMono,
              fontSize: 11,
              formatter: (p: { value: number }) => formatValue(p.value, spec.unit),
            }
          : { show: false },
        markLine: {
          silent: true,
          symbol: "none",
          animation: false,
          data: [
            ...(spec.diverging
              ? [
                  {
                    [horizontal ? "xAxis" : "yAxis"]: 0,
                    lineStyle: { color: t.muted, type: "solid" },
                  },
                ]
              : []),
            ...spec.thresholds.map((th) => ({
              [horizontal ? "xAxis" : "yAxis"]: th.y,
              label: { show: false },
              lineStyle: { color: t.muted, type: "dashed", opacity: 0.55 },
            })),
          ],
        },
      },
    ],
  };
}
