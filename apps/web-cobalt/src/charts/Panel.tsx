import type { ChartSpec } from "@onyc/chart-specs";
import { useMemo, type ReactNode } from "react";
import { Chart } from "./Chart";
import { ChartFrame, type RangeKey } from "./ChartFrame";

export interface QueryLike<D> {
  data: D | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

interface PanelProps<D> {
  q: QueryLike<D>;
  /** Turns the API response into a chart spec. Pass a module-level function so its identity is stable. */
  build: (d: D) => ChartSpec | null;
  title: string;
  /** Grid columns out of 12. Omit to render the frame without a grid cell wrapper. */
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  height?: number;
  range?: RangeKey;
  onRange?: (r: RangeKey) => void;
  plain?: boolean;
  hideTitle?: boolean;
}

/** A chart card fed by one API query: loading skeleton, error banner (last good chart stays), empty state, footer. */
export function Panel<D>({
  q,
  build,
  title,
  span,
  height,
  range,
  onRange,
  plain,
  hideTitle,
}: PanelProps<D>): ReactNode {
  const spec = useMemo(() => (q.data === undefined ? null : build(q.data)), [q.data, build]);
  const status = q.isError ? "error" : q.isLoading ? "loading" : "ready";
  const frame = (
    <ChartFrame
      spec={spec}
      status={status}
      loadingTitle={title}
      {...(plain === true ? { plain } : {})}
      {...(hideTitle === true ? { hideTitle } : {})}
      error={
        q.isError
          ? `${title}: ${q.error instanceof Error ? q.error.message : "request failed"}.`
          : undefined
      }
      {...(height !== undefined ? { height } : {})}
      {...(range !== undefined && onRange !== undefined ? { range, onRange } : {})}
    >
      {spec !== null && <Chart spec={spec} {...(height !== undefined ? { height } : {})} />}
    </ChartFrame>
  );
  return span === undefined ? frame : <div className={`span-${span}`}>{frame}</div>;
}
