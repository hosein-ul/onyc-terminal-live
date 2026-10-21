import type { ChartSpec } from "@onyc/chart-specs";
import {
  CustomChart,
  HeatmapChart,
  LineChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
} from "echarts/charts";
import {
  AriaComponent,
  CalendarComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import { optionFor } from "./options.js";
import { makeTheme } from "./theme.js";
import type { ChartTokens } from "./tokens.js";

echarts.use([
  CustomChart,
  HeatmapChart,
  LineChart,
  SankeyChart,
  ScatterChart,
  TreemapChart,
  AriaComponent,
  CalendarComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
  SVGRenderer,
]);

export interface EchartHandle {
  /** Redraw with a new spec or new tokens. */
  update(spec: ChartSpec, tokens?: ChartTokens): void;
  /** The drawn `<svg>`, for PNG export; null when the chart is drawn on canvas. */
  svg(): SVGSVGElement | null;
  /** PNG data URL, for canvas-rendered charts. */
  canvasPng(): string | null;
  dispose(): void;
}

interface Target {
  seriesIndex: number;
  dataIndex: number;
}

/** Items a keyboard user can step through. Treemap and sankey have no reliable tooltip action, so they use the table view. */
function targetsOf(option: { series?: unknown }): Target[] {
  const series = Array.isArray(option.series)
    ? (option.series as { type?: string; data?: unknown[] }[])
    : [];
  const out: Target[] = [];
  series.forEach((s, seriesIndex) => {
    if (s.type === "treemap" || s.type === "sankey") return;
    if (s.type === "line" && seriesIndex === 0) return; // the equality line of the Lorenz chart
    (s.data ?? []).forEach((_, dataIndex) => out.push({ seriesIndex, dataIndex }));
  });
  return out;
}

const reducedMotion = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Draw `spec` into `el` with the app's tokens. Adds the interaction every chart must have: it resizes with its
 * container, stops animating under `prefers-reduced-motion`, describes itself with `aria-label`, and can be
 * stepped through with the arrow keys (Enter pins the tooltip, Escape releases it).
 */
export function createEchart(el: HTMLElement, spec: ChartSpec, tokens: ChartTokens): EchartHandle {
  let current = spec;
  let currentTokens = tokens;
  let chart: echarts.ECharts | null = null;
  let renderer: "svg" | "canvas" = "svg";
  let targets: Target[] = [];
  let cursor = -1;
  let pinned = false;

  const wantRenderer = (s: ChartSpec): "svg" | "canvas" =>
    s.kind === "scatter" && s.points.length > 5000 ? "canvas" : "svg";

  const draw = (): void => {
    const want = wantRenderer(current);
    if (chart === null || want !== renderer) {
      chart?.dispose();
      renderer = want;
      chart = echarts.init(el, makeTheme(currentTokens), { renderer });
    }
    const option = optionFor(current, { tokens: currentTokens, motion: !reducedMotion() });
    chart.setOption(
      {
        ...option,
        tooltip: { ...(option as { tooltip?: object }).tooltip, alwaysShowContent: pinned },
      },
      { notMerge: true },
    );
    targets = targetsOf(option as { series?: unknown });
    cursor = -1;
  };

  const show = (i: number): void => {
    const target = targets[i];
    if (chart === null || target === undefined) return;
    chart.dispatchAction({ type: "downplay" });
    chart.dispatchAction({
      type: "showTip",
      seriesIndex: target.seriesIndex,
      dataIndex: target.dataIndex,
    });
    chart.dispatchAction({
      type: "highlight",
      seriesIndex: target.seriesIndex,
      dataIndex: target.dataIndex,
    });
  };

  const onKey = (e: KeyboardEvent): void => {
    if (targets.length === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      cursor = Math.min(targets.length - 1, cursor + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") cursor = Math.max(0, cursor - 1);
    else if (e.key === "Home") cursor = 0;
    else if (e.key === "End") cursor = targets.length - 1;
    else if (e.key === "Enter") {
      pinned = !pinned;
      draw();
      if (pinned) show(Math.max(0, cursor));
      return;
    } else if (e.key === "Escape") {
      pinned = false;
      chart?.dispatchAction({ type: "hideTip" });
      chart?.dispatchAction({ type: "downplay" });
      return;
    } else return;
    e.preventDefault();
    show(cursor);
  };

  el.tabIndex = 0;
  el.setAttribute("role", "img");
  el.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(el);
  draw();
  el.setAttribute("aria-label", `${spec.title}. ${spec.summary}`);

  return {
    update(next, nextTokens) {
      current = next;
      if (nextTokens !== undefined) currentTokens = nextTokens;
      el.setAttribute("aria-label", `${next.title}. ${next.summary}`);
      draw();
    },
    svg: () => el.querySelector("svg"),
    canvasPng: () =>
      renderer === "canvas"
        ? (chart?.getDataURL({ pixelRatio: 2, backgroundColor: currentTokens.surface }) ?? null)
        : null,
    dispose() {
      el.removeEventListener("keydown", onKey);
      ro.disconnect();
      chart?.dispose();
      chart = null;
    },
  };
}
