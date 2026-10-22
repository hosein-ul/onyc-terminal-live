import { readTokens, type ChartTokens } from "@onyc/charts-echarts";
import { useMemo } from "react";
import { useTheme } from "../lib/theme";

/** The app's chart skin, read from the `--chart-*` custom properties on <html> and again when the theme changes. */
export function useChartTokens(): ChartTokens {
  const theme = useTheme();
  return useMemo(() => readTokens(document.documentElement), [theme]);
}
