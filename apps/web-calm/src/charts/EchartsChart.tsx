import { createEchart, type EchartHandle } from "@onyc/charts-echarts";
import type { ChartSpec } from "@onyc/chart-specs";
import { useEffect, useRef } from "react";
import { useChartTokens } from "./useTokens";

/** The complex chart types (sankey, treemap, Gantt, calendar, Lorenz, bubble, waterfall) through the shared ECharts layer. */
export function EchartsChart({ spec, height = 320 }: { spec: ChartSpec; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<EchartHandle | null>(null);
  const tokens = useChartTokens();

  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    handle.current = createEchart(el, spec, tokens);
    return () => {
      handle.current?.dispose();
      handle.current = null;
    };
    // The chart is created once; spec changes go through update() below.
  }, []);

  useEffect(() => {
    handle.current?.update(spec, tokens);
  }, [spec, tokens]);

  return <div ref={ref} className="ch-echarts" style={{ width: "100%", height }} />;
}
