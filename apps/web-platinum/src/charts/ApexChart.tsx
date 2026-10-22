import {
  formatValue,
  type CalendarSpec,
  type ChartSpec,
  type TimeSeriesSpec,
  type WaterfallSpec,
} from "@onyc/chart-specs";
import { formatDate } from "@onyc/format";
import type { ChartTokens } from "@onyc/charts-echarts";
import ApexCharts from "apexcharts";
import { useEffect, useMemo, useRef } from "react";
import { usePrefersReducedMotion } from "./motion";
import { useChartTokens } from "./useTokens";

type Options = ApexCharts.ApexOptions;

/** Platinum's ApexCharts skin: dark, high contrast, thin axes, mono labels, rounded tooltips with a white edge. */
function base(t: ChartTokens, height: number, motion: boolean): Options {
  return {
    chart: {
      height,
      background: "transparent",
      fontFamily: t.fontMono,
      foreColor: t.muted,
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: motion, speed: 450 },
    },
    grid: { borderColor: t.grid, strokeDashArray: 0, xaxis: { lines: { show: false } } },
    tooltip: { theme: "dark", style: { fontFamily: t.fontMono, fontSize: "12px" } },
    dataLabels: { enabled: false },
    legend: { show: false },
  };
}

const intraday = (xs: string[]): boolean => {
  const first = xs[0];
  const last = xs[xs.length - 1];
  return (
    first !== undefined &&
    last !== undefined &&
    first.includes("T") &&
    new Date(last).getTime() - new Date(first).getTime() < 3 * 86_400_000
  );
};

function timeSeries(
  spec: TimeSeriesSpec,
  t: ChartTokens,
  height: number,
  motion: boolean,
): Options {
  const xs = spec.series[0]?.points.map((p) => p.x) ?? [];
  const intra = intraday(xs);
  // Sparklines carry day offsets, not dates; those are drawn on a numeric axis by position.
  const dated = xs.every((x) => !Number.isNaN(Date.parse(x)));
  const compact = spec.compact === true;
  const roleColor = (role: string): string =>
    role === "primary" ? t.accent : role === "secondary" ? t.ink : t.muted;
  const o = base(t, height, motion);
  const events = spec.annotations.filter((a) => a.kind === "event" && a.y !== null);
  const end = spec.annotations.find((a) => a.kind === "end");
  return {
    ...o,
    chart: {
      ...o.chart,
      type: spec.variant === "area" ? "area" : "line",
      ...(compact ? { sparkline: { enabled: true } } : {}),
    },
    series: spec.series.map((s) => ({
      name: s.label,
      data: s.points.map(
        (p, i) => [dated ? new Date(p.x).getTime() : i, p.y] as [number, number | null],
      ),
    })),
    colors: spec.series.map((s) => roleColor(s.role)),
    stroke: {
      width: spec.series.map((s) => (s.role === "primary" ? 2.4 : 1.6)),
      curve: "straight",
      dashArray: spec.series.map((s) => (s.role === "reference" ? 5 : 0)),
    },
    fill:
      spec.variant === "area"
        ? {
            type: "gradient",
            gradient: { shadeIntensity: 0, opacityFrom: 0.32, opacityTo: 0, stops: [0, 100] },
          }
        : { type: "solid", opacity: 1 },
    markers: { size: 0, hover: { size: compact ? 0 : 5 } },
    ...(compact
      ? { grid: { show: false, padding: { left: 0, right: 0, top: 0, bottom: 0 } } }
      : {}),
    xaxis: {
      type: dated ? "datetime" : "numeric",
      labels: {
        show: !compact,
        datetimeUTC: true,
        ...(intra ? { datetimeFormatter: { hour: "HH:mm", minute: "HH:mm" } } : {}),
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: { stroke: { color: t.ink, dashArray: 3 } },
    },
    yaxis: {
      show: !compact,
      tickAmount: 5,
      ...(spec.zeroBased ? { min: 0 } : spec.floor !== undefined ? { min: spec.floor } : {}),
      ...(spec.logScale === true ? { logarithmic: true } : {}),
      labels: { formatter: (v: number) => formatValue(v, spec.unit) },
    },
    tooltip: {
      ...o.tooltip,
      x: dated ? { format: intra ? "dd MMM HH:mm 'UTC'" : "dd MMM yyyy" } : { show: false },
      y: { formatter: (v: number) => formatValue(v, spec.unit) },
    },
    annotations: {
      yaxis: spec.annotations.flatMap((a) =>
        a.kind === "threshold"
          ? [
              {
                y: a.y,
                borderColor: a.tone === "bad" ? t.bad : t.muted,
                strokeDashArray: 4,
                label: {
                  text: a.label,
                  borderWidth: 0,
                  style: { background: "transparent", color: t.muted, fontFamily: t.fontMono },
                },
              },
            ]
          : [],
      ),
      points: [
        ...events.flatMap((a) =>
          a.kind === "event" && a.y !== null
            ? [
                {
                  x: new Date(a.x).getTime(),
                  y: a.y,
                  marker: {
                    size: 4,
                    fillColor: a.tone === "bad" ? t.bad : t.ink,
                    strokeColor: t.surface,
                    strokeWidth: 2,
                    radius: 2,
                  },
                },
              ]
            : [],
        ),
        ...(end !== undefined && end.kind === "end" && !compact
          ? [
              {
                x: new Date(end.x).getTime(),
                y: end.y,
                marker: { size: 6, fillColor: t.accent, strokeColor: t.surface, strokeWidth: 2 },
                label: {
                  text: end.label,
                  offsetX: 34,
                  borderWidth: 0,
                  style: { background: "transparent", color: t.ink, fontFamily: t.fontMono },
                },
              },
            ]
          : []),
      ],
    },
  };
}

function waterfall(spec: WaterfallSpec, t: ChartTokens, height: number, motion: boolean): Options {
  const o = base(t, height, motion);
  let run = 0;
  const data = spec.steps.map((s) => {
    const from = s.type === "total" ? 0 : run;
    const to = s.type === "total" ? s.value : run + s.value;
    if (s.type === "delta") run += s.value;
    const hi = Math.max(from, to);
    return {
      x: [s.label, formatValue(s.value, spec.unit)],
      // ApexCharts drops a bar whose end is exactly zero; one unit is invisible at these scales.
      y: [Math.min(from, to), hi === 0 ? 1 : hi],
    };
  });
  const colors = spec.steps.map((s) =>
    s.type === "total" ? t.ink : s.value >= 0 ? t.accent : t.bad,
  );
  return {
    ...o,
    chart: { ...o.chart, type: "rangeBar" },
    series: [{ data }],
    colors,
    fill: { opacity: 1 },
    plotOptions: { bar: { distributed: true, columnWidth: "46%", borderRadius: 3 } },
    xaxis: {
      labels: { style: { colors: t.ink, fontSize: "11px" }, trim: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: { labels: { formatter: (v: number) => formatValue(v, spec.unit) } },
    tooltip: {
      ...o.tooltip,
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const s = spec.steps[dataPointIndex];
        return s === undefined
          ? ""
          : `<div style="padding:8px 10px;font-family:${t.fontMono}">${s.label}<br><b>${formatValue(s.value, spec.unit)}</b></div>`;
      },
    },
  };
}

function calendar(spec: CalendarSpec, t: ChartTokens, height: number, motion: boolean): Options {
  const o = base(t, height, motion);
  const days = spec.days.filter((d) => d.value !== null);
  const sorted = days.map((d) => d.value ?? 0).sort((a, b) => a - b);
  const q = (p: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] ?? 0;
  const first = spec.days[0];
  const day0 = first === undefined ? 0 : new Date(`${first.date}T00:00:00Z`).getUTCDay();
  const weeks = Math.ceil((spec.days.length + day0) / 7);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const rows = names.map((name) => ({
    name,
    data: Array.from({ length: weeks }, (_, w) => ({ x: `w${w}`, y: null as number | null })),
  }));
  spec.days.forEach((d, i) => {
    const k = i + day0;
    const row = rows[k % 7];
    if (row !== undefined) row.data[Math.floor(k / 7)] = { x: d.date, y: d.value };
  });
  const lo = q(0.2);
  return {
    ...o,
    chart: { ...o.chart, type: "heatmap" },
    series: rows.reverse(),
    stroke: { width: 3, colors: [t.surface] },
    plotOptions: {
      heatmap: {
        radius: 2,
        enableShades: false,
        colorScale: {
          ranges: [
            { from: Number.NEGATIVE_INFINITY, to: lo, color: t.grid },
            { from: lo + 1e-9, to: q(0.4), color: t.series[5] ?? t.grid },
            { from: q(0.4) + 1e-9, to: q(0.6), color: t.series[7] ?? t.muted },
            { from: q(0.6) + 1e-9, to: q(0.85), color: t.accent },
            { from: q(0.85) + 1e-9, to: Number.POSITIVE_INFINITY, color: t.ink },
          ],
        },
      },
    },
    xaxis: {
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { style: { colors: t.muted } } },
    tooltip: {
      ...o.tooltip,
      custom: ({
        seriesIndex,
        dataPointIndex,
      }: {
        seriesIndex: number;
        dataPointIndex: number;
      }) => {
        const p = rows[seriesIndex]?.data[dataPointIndex];
        return p === undefined || p.y === null
          ? ""
          : `<div style="padding:8px 10px;font-family:${t.fontMono}">${formatDate(p.x)}<br><b>${spec.valueLabel}: ${formatValue(p.y, spec.unit)}</b></div>`;
      },
    },
  };
}

/** Which specs this adapter draws; everything else stays with Recharts, Tremor or ECharts. */
export function drawsWithApex(spec: ChartSpec): boolean {
  if (spec.kind === "timeseries") return spec.spread === undefined && spec.series.length <= 3;
  return spec.kind === "waterfall" || spec.kind === "calendar";
}

function optionsFor(spec: ChartSpec, t: ChartTokens, height: number, motion: boolean): Options {
  switch (spec.kind) {
    case "timeseries":
      return timeSeries(spec, t, height, motion);
    case "waterfall":
      return waterfall(spec, t, height, motion);
    case "calendar":
      return calendar(spec, t, height, motion);
    default:
      return {};
  }
}

export function ApexChart({ spec, height = 300 }: { spec: ChartSpec; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ApexCharts | null>(null);
  const tokens = useChartTokens();
  const motion = !usePrefersReducedMotion();
  const options = useMemo(
    () => optionsFor(spec, tokens, height, motion),
    [spec, tokens, height, motion],
  );

  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    const c = new ApexCharts(el, options);
    chart.current = c;
    void c.render();
    return () => {
      c.destroy();
      chart.current = null;
    };
    // Created once; later spec changes go through updateOptions below.
  }, []);

  useEffect(() => {
    void chart.current?.updateOptions(options, true, motion);
  }, [options, motion]);

  return <div ref={ref} className="ch-apex" style={{ width: "100%", minHeight: height }} />;
}
