import type { ChartSpec } from "@onyc/chart-specs";
import { lazy, Suspense } from "react";
import { BarsChart } from "./BarsChart";
import { RingChart } from "./RingChart";
import { StackBarChart } from "./StackBarChart";
import { StackedChart } from "./StackedChart";
import { TimeSeriesChart } from "./TimeSeriesChart";
import { TremorBars } from "./TremorCharts";

// ECharts is the heaviest dependency; it loads only when a page shows a complex chart.
const EchartsChart = lazy(() =>
  import("./EchartsChart").then((m) => ({ default: m.EchartsChart })),
);

/**
 * Platinum's drawing libraries. Tremor draws the simple bar charts and bar lists (its sparkline cannot be stopped from
 * animating for 1.5 s, so sparklines use Recharts); Recharts (shadcn/ui charts pattern)
 * draws every chart that needs annotations, thresholds or edge labels; single ratios are rings; the complex types
 * go through ECharts.
 */
// Wide chart types keep a readable minimum width and scroll sideways inside their frame on a phone.
const MIN_WIDTH: Partial<Record<ChartSpec["kind"], number>> = {
  gantt: 720,
  sankey: 640,
  calendar: 760,
};

export function Chart({ spec, height }: { spec: ChartSpec; height?: number }) {
  const h = height !== undefined ? { height } : {};
  switch (spec.kind) {
    case "timeseries":
      return <TimeSeriesChart spec={spec} {...h} />;
    case "stacked":
      return <StackedChart spec={spec} {...h} />;
    case "bars":
      return spec.thresholds.length > 0 ? (
        <BarsChart spec={spec} {...h} />
      ) : (
        <TremorBars spec={spec} />
      );
    case "stackbar":
      return <StackBarChart spec={spec} />;
    case "bullet":
      return <RingChart spec={spec} />;
    case "multiples":
      return (
        <div className="ch-multiples">
          {spec.items.map((item) => (
            <figure key={item.id} className="ch-multiple">
              <figcaption>{item.title}</figcaption>
              <TimeSeriesChart spec={item} height={110} />
            </figure>
          ))}
        </div>
      );
    default: {
      const min = MIN_WIDTH[spec.kind];
      const chart = (
        <Suspense
          fallback={
            <div className="ch-skeleton" style={{ height: height ?? 320 }} aria-hidden="true" />
          }
        >
          <EchartsChart spec={spec} {...(height !== undefined ? { height } : {})} />
        </Suspense>
      );
      return min === undefined ? (
        chart
      ) : (
        <div className="ch-scroll">
          <div style={{ minWidth: min }}>{chart}</div>
        </div>
      );
    }
  }
}
