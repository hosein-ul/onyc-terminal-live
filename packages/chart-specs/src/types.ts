/**
 * Library-agnostic chart specs. A spec holds the data, the annotations, the units and the provenance of one chart;
 * the apps draw it with whichever library suits their direction. Nothing here knows about a library or a colour.
 */

/** Where a chart's numbers came from. Every chart carries one; the frame prints it as the footer. */
export interface Provenance {
  source: string;
  /** The oldest fetch time among the datasets behind the chart; null when never fetched. */
  fetchedAt: string | null;
  stale: boolean;
}

export type Unit = "usd" | "pct" | "bps" | "nav" | "count" | "points" | "ppm" | "ratio" | "text";

/** A semantic tone; each app maps tones to its own colours. */
export type Tone = "neutral" | "good" | "bad" | "accent";

export interface ChartBase {
  /** Stable id, also the file name of exports. */
  id: string;
  title: string;
  subtitle?: string;
  provenance: Provenance;
  /** Sentence that describes the chart from its data, for `aria-label`. */
  summary: string;
  /** Shown when history is short or data is partial, e.g. "Collecting since 21 Oct 2026". */
  note?: string;
  /** Set when there is nothing to draw; the frame shows this text as the empty state. */
  empty?: string;
}

export interface TimePoint {
  /** ISO date or date-time. */
  x: string;
  y: number | null;
}

export interface Series {
  key: string;
  label: string;
  points: TimePoint[];
  /** primary is the hero line; reference lines are drawn thinner and muted. */
  role: "primary" | "secondary" | "reference";
}

export type Annotation =
  | { kind: "event"; x: string; y: number | null; label: string; tone: Tone }
  | { kind: "threshold"; y: number; label: string; tone: Tone }
  | { kind: "end"; x: string; y: number; label: string };

export interface TimeSeriesSpec extends ChartBase {
  kind: "timeseries";
  variant: "line" | "area";
  unit: Unit;
  series: Series[];
  annotations: Annotation[];
  /** Daily data that moves in steps is drawn with straight segments, never smoothed. */
  smooth: false;
  /** Shade the gap between two series by the sign of (a − b): premium vs discount. */
  spread?: { a: string; b: string };
  /** Y axis does not start at zero for price-like series. */
  zeroBased: boolean;
  /** Draw without axes, for KPI strips. */
  compact?: boolean;
  /** Logarithmic y axis. */
  logScale?: boolean;
}

export interface StackedSpec extends ChartBase {
  kind: "stacked";
  unit: Unit;
  mode: "absolute" | "percent";
  /** Largest first; the app labels the right edge instead of drawing a legend. */
  keys: { key: string; label: string }[];
  rows: { x: string; values: Record<string, number> }[];
}

export interface Bar {
  label: string;
  value: number | null;
  tone?: Tone;
  /** For grouped or stacked bars. */
  group?: string;
}

export interface BarsSpec extends ChartBase {
  kind: "bars";
  unit: Unit;
  orientation: "vertical" | "horizontal";
  /** Colour by sign; zero line is drawn. */
  diverging: boolean;
  bars: Bar[];
  thresholds: { y: number; label: string }[];
}

export interface StackBarSpec extends ChartBase {
  kind: "stackbar";
  unit: Unit;
  parts: { key: string; label: string; value: number; basis: string }[];
  total: { label: string; value: number };
  /** The check is shown, not assumed. */
  sumCheck: { sum: number; total: number; difference: number; ok: boolean };
}

export interface BulletSpec extends ChartBase {
  kind: "bullet";
  unit: Unit;
  /** null when the value is not available; the frame says so. */
  value: number | null;
  target: { value: number; label: string } | null;
  max: number;
  /** Anything past this is shown as exceeding the scale. */
  valueLabel: string;
}

export interface ScatterPoint {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Bubble area, e.g. capital. */
  size?: number;
  group: string;
}

export interface ScatterSpec extends ChartBase {
  kind: "scatter";
  xUnit: Unit;
  yUnit: Unit;
  xLabel: string;
  yLabel: string;
  xLog: boolean;
  points: ScatterPoint[];
  /** Quadrant guide lines, drawn as thin reference lines. */
  guides: { axis: "x" | "y"; value: number; label: string }[];
  sizeLabel?: string;
}

export interface CalendarSpec extends ChartBase {
  kind: "calendar";
  unit: Unit;
  valueLabel: string;
  days: { date: string; value: number | null }[];
}

export interface LorenzSpec extends ChartBase {
  kind: "lorenz";
  /** Cumulative share of wallets (x) and of points (y), both 0..1. */
  points: { x: number; y: number }[];
  gini: number | null;
  wallets: number;
}

export interface GanttSpec extends ChartBase {
  kind: "gantt";
  today: string;
  rows: {
    id: string;
    label: string;
    start: string;
    end: string;
    group: string;
    capital: number;
    status: string;
  }[];
}

export interface TreeNode {
  name: string;
  value?: number;
  children?: TreeNode[];
  /** Free-text qualifier for the tooltip, such as an asset tag. */
  tag?: string;
}

export interface TreemapSpec extends ChartBase {
  kind: "treemap";
  unit: Unit;
  root: TreeNode[];
}

export interface SankeySpec extends ChartBase {
  kind: "sankey";
  unit: Unit;
  nodes: { id: string; label: string }[];
  links: { source: string; target: string; value: number }[];
}

export interface WaterfallSpec extends ChartBase {
  kind: "waterfall";
  unit: Unit;
  steps: { label: string; value: number; type: "delta" | "total" }[];
}

export interface MultiplesSpec extends ChartBase {
  kind: "multiples";
  sharedY: boolean;
  items: TimeSeriesSpec[];
}

export type ChartSpec =
  | TimeSeriesSpec
  | StackedSpec
  | BarsSpec
  | StackBarSpec
  | BulletSpec
  | ScatterSpec
  | CalendarSpec
  | LorenzSpec
  | GanttSpec
  | TreemapSpec
  | SankeySpec
  | WaterfallSpec
  | MultiplesSpec;

export type ChartKind = ChartSpec["kind"];
