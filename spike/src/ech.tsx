import { LineChart } from "echarts/charts";
import { GridComponent, MarkPointComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { CapitalData, NavData } from "./data";
import { nav6, tok, usd } from "./tok";

echarts.use([LineChart, GridComponent, TooltipComponent, MarkPointComponent, SVGRenderer, CanvasRenderer]);

function useEchart(build: (t: Record<string, string>) => echarts.EChartsCoreOption) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const chart = echarts.init(el, undefined, { renderer: "svg" });
    chart.setOption(build(tok(el)));
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
    };
  });
  return ref;
}

const axisCommon = (t: Record<string, string>) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: t["muted"], fontFamily: t["font-mono"], fontSize: 11 },
});
const tooltipCommon = (t: Record<string, string>) => ({
  trigger: "axis" as const,
  backgroundColor: t["tip-bg"],
  borderColor: t["line"],
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: t["tip-ink"], fontFamily: t["font-ui"], fontSize: 12 },
  extraCssText: "border-radius:14px;box-shadow:none;",
  axisPointer: { lineStyle: { color: t["muted"], type: "dashed" as const } },
});

export function EchartsNav({ d }: { d: NavData }) {
  const ref = useEchart((t) => {
    const s = d.series;
    const last = s[s.length - 1]!;
    const min = Math.min(...s.map((p) => p.nav));
    const max = Math.max(...s.map((p) => p.nav));
    return {
      animation: false,
      textStyle: { fontFamily: t["font-ui"] },
      grid: { left: 8, right: 64, top: 16, bottom: 4, containLabel: true },
      tooltip: { ...tooltipCommon(t), valueFormatter: (v: number) => nav6(v) },
      xAxis: { type: "time", splitNumber: 5, ...axisCommon(t), axisLabel: { ...axisCommon(t).axisLabel, hideOverlap: true, formatter: "{MMM} {d}" } },
      yAxis: {
        type: "value",
        min: min * 0.998,
        max: max * 1.002,
        splitNumber: 4,
        ...axisCommon(t),
        axisLabel: { ...axisCommon(t).axisLabel, formatter: (v: number) => v.toFixed(2) },
        splitLine: { lineStyle: { color: t["grid"] } },
      },
      series: [
        {
          type: "line",
          name: "NAV",
          showSymbol: false,
          smooth: true,
          data: s.map((p) => [p.date, p.nav]),
          lineStyle: { width: Number(t["stroke"]), color: t["accent"], cap: "round", join: "round" },
          itemStyle: { color: t["accent"] },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: `${t["accent"]}38` },
                { offset: 1, color: `${t["accent"]}00` },
              ],
            },
          },
          markPoint: {
            animation: false,
            symbol: "circle",
            data: [
              ...d.events
                .filter((e) => e.reason === "downtick")
                .map((e) => ({
                  coord: [e.date, s.find((p) => p.date === e.date)?.nav ?? 0],
                  symbolSize: 9,
                  itemStyle: { color: t["surface"], borderColor: t["bad"], borderWidth: 2 },
                  label: { show: false },
                })),
              {
                coord: [last.date, last.nav],
                symbolSize: 12,
                itemStyle: { color: t["accent"], borderColor: t["surface"], borderWidth: 2 },
                label: { show: true, formatter: nav6(last.nav), position: "right", distance: 8, color: t["ink"], fontFamily: t["font-mono"], fontWeight: 600, fontSize: 12 },
              },
            ],
          },
        },
      ],
    };
  });
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}

export function EchartsCapital({ d }: { d: CapitalData }) {
  const ref = useEchart((t) => {
    const keys = [...d.keys].reverse();
    return {
      animation: false,
      textStyle: { fontFamily: t["font-ui"] },
      grid: { left: 8, right: 8, top: 12, bottom: 4, containLabel: true },
      tooltip: { ...tooltipCommon(t), valueFormatter: (v: number) => usd(v) },
      xAxis: { type: "time", splitNumber: 5, ...axisCommon(t), axisLabel: { ...axisCommon(t).axisLabel, hideOverlap: true, formatter: "{MMM} {d}" } },
      yAxis: {
        type: "value",
        ...axisCommon(t),
        axisLabel: { ...axisCommon(t).axisLabel, formatter: (v: number) => `${Math.round(v / 1e6)}M` },
        splitLine: { lineStyle: { color: t["grid"] } },
      },
      series: keys.map((k, i) => ({
        type: "line",
        name: k,
        stack: "cap",
        showSymbol: false,
        smooth: true,
        data: d.rows.map((r) => [r.date, Number(r[k])]),
        lineStyle: { width: 1, color: t["surface"] },
        itemStyle: { color: t[`s${keys.length - i}`] },
        areaStyle: { color: t[`s${keys.length - i}`], opacity: 0.92 },
        emphasis: { disabled: true },
      })),
    };
  });
  return <div ref={ref} style={{ width: "100%", height: "100%" }} />;
}
