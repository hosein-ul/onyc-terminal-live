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

  // Say what the square markers on a time series are, so none of them reads as a stray data point.
  const kinds =
    spec.kind === "timeseries"
      ? (["accent", "bad", "neutral"] as const).flatMap((k) => {
          const n = spec.annotations.filter(
            (a) => a.kind === "event" && a.y !== null && a.tone === k,
          );
          return n.length === 0 ? [] : [{ tone: k, count: n.length, label: EVENT_LABEL[k] }];
        })
      : [];

  return (
    <div style={{ width: "100%" }}>
      <div ref={ref} className="ch-echarts" style={{ width: "100%", height }} />
      {kinds.length > 0 && (
        <ul className="chart-key chart-key-square" aria-label="Markers on the line">
          {kinds.map((k) => (
            <li key={k.tone}>
              <i style={{ borderColor: TONE[k.tone] }} aria-hidden="true" />
              {k.label} <span>{k.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EVENT_LABEL = {
  accent: "New price vector",
  bad: "Down-tick",
  neutral: "Outlier step",
} as const;

const TONE = {
  accent: "var(--chart-accent)",
  bad: "var(--chart-bad)",
  neutral: "var(--chart-muted)",
} as const;
