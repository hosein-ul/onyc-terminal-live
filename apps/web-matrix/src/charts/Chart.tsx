import type { ChartSpec } from "@onyc/chart-specs";
import { lazy, Suspense } from "react";
import { BulletChart } from "./BulletChart";
import { StackBarChart } from "./StackBarChart";

// Dot Matrix draws every chart with ECharts, which loads on demand; the single-bar stack and the meter are small SVG.
const EchartsChart = lazy(() =>
  import("./EchartsChart").then((m) => ({ default: m.EchartsChart })),
);

const MIN_WIDTH: Partial<Record<ChartSpec["kind"], number>> = {
  gantt: 720,
  sankey: 640,
  calendar: 760,
};

const skeleton = (height: number) => (
  <div className="ch-skeleton" style={{ height }} aria-hidden="true" />
);

export function Chart({ spec, height }: { spec: ChartSpec; height?: number }) {
  switch (spec.kind) {
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
              <Suspense fallback={skeleton(110)}>
                <EchartsChart spec={item} height={110} />
              </Suspense>
            </figure>
          ))}
        </div>
      );
    default: {
      const min = MIN_WIDTH[spec.kind];
      const chart = (
        <Suspense fallback={skeleton(height ?? 320)}>
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
