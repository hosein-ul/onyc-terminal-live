import { alpha, type ChartTokens } from "./tokens.js";

/**
 * ECharts theme object for an app's tokens: the base look every chart inherits (axes, grid, tooltip, text), so a
 * chart that forgets to style something still comes out in the app's skin rather than ECharts' defaults.
 */
export function makeTheme(t: ChartTokens): Record<string, unknown> {
  const axis = {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: t.muted, fontFamily: t.fontMono, fontSize: 11 },
    splitLine: { lineStyle: { color: t.grid, width: 1 } },
    nameTextStyle: { color: t.muted, fontFamily: t.fontUi },
  };
  return {
    color: t.series,
    backgroundColor: "transparent",
    textStyle: { fontFamily: t.fontUi, color: t.ink },
    animationDuration: 250,
    animationDurationUpdate: 200,
    animationEasing: "cubicOut",
    grid: { containLabel: true, left: 8, right: 16, top: 24, bottom: 8 },
    categoryAxis: { ...axis, axisLine: { show: true, lineStyle: { color: t.line } } },
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,
    tooltip: {
      backgroundColor: t.tooltipBg,
      borderColor: t.line,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.tooltipInk, fontFamily: t.fontUi, fontSize: 12 },
      extraCssText: `border-radius:${Math.min(t.radius, 16)}px;box-shadow:none;`,
      axisPointer: {
        lineStyle: { color: t.muted, type: "dashed" },
        crossStyle: { color: t.muted },
      },
    },
    emphasis: { itemStyle: { borderColor: t.ink, borderWidth: 1.5 } },
    markLine: {
      lineStyle: { color: t.muted, type: "dashed", width: 1 },
      label: { color: t.muted, fontFamily: t.fontMono, fontSize: 11 },
    },
    legend: {
      textStyle: { color: t.muted, fontFamily: t.fontUi },
      inactiveColor: alpha(t.muted, 0.4),
    },
  };
}

export const THEME_NAME = "onyc";
