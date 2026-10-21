import type { ChartSpec } from "@onyc/chart-specs";
import { lazy, Suspense } from "react";
import { BarsChart } from "./BarsChart";
import { BulletChart } from "./BulletChart";
import { StackBarChart } from "./StackBarChart";
import { StackedChart } from "./StackedChart";
import { TimeSeriesChart } from "./TimeSeriesChart";

// ECharts is the heaviest dependency; it loads only when a page shows a complex chart.
const EchartsChart = lazy(() =>
  import("./EchartsChart").then((m) => ({ default: m.EchartsChart })),
);

/**
 * Pick the drawing library for a spec. Ordinary time series, stacked areas and bars go to Recharts (the shadcn/ui
 * charts pattern); the single-bar stack and the bullet meter are small SVG; everything complex goes to ECharts.
 */
// Wide chart types keep a readable minimum width and scroll sideways inside their frame on a phone.
const MIN_WIDTH: Partial<Record<ChartSpec["kind"], number>> = {
  gantt: 720,
  sankey: 640,
  calendar: 760,
};

export function Chart({ spec, height }: { spec: ChartSpec; height?: number }) {
  switch (spec.kind) {
    case "timeseries":
      return <TimeSeriesChart spec={spec} {...(height !== undefined ? { height } : {})} />;
    case "stacked":
      return <StackedChart spec={spec} {...(height !== undefined ? { height } : {})} />;
    case "bars":
      return <BarsChart spec={spec} {...(height !== undefined ? { height } : {})} />;
    case "stackbar":
      return <StackBarChart spec={spec} />;
    case "bullet":
      return <BulletChart spec={spec} />;
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
