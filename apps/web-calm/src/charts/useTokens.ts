import { readTokens, type ChartTokens } from "@onyc/charts-echarts";
import { useMemo } from "react";

/** The app's chart skin, read once from the `--chart-*` custom properties on <html>. */
export function useChartTokens(): ChartTokens {
  return useMemo(() => readTokens(document.documentElement), []);
}
