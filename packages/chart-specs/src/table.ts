import type { ChartSpec, TimeSeriesSpec, TreeNode, Unit } from "./types.js";

export type Cell = string | number | null;

/** The exact data behind a chart, as a table. Drives the "show as table" view and the CSV export. */
export interface DataTable {
  columns: { label: string; unit?: Unit }[];
  rows: Cell[][];
}

/** Dates sort chronologically; relative labels such as "day -29" keep the order they arrived in. */
export function orderX(xs: string[]): string[] {
  return xs.every((x) => /^\d{4}-\d{2}/.test(x)) ? [...xs].sort() : xs;
}

function joinSeries(spec: TimeSeriesSpec, prefix = ""): DataTable {
  const xs = orderX([...new Set(spec.series.flatMap((s) => s.points.map((p) => p.x)))]);
  const lookups = spec.series.map((s) => new Map(s.points.map((p) => [p.x, p.y] as const)));
  return {
    columns: [
      { label: "date" },
      ...spec.series.map((s) => ({ label: `${prefix}${s.label}`, unit: spec.unit })),
    ],
    rows: xs.map((x) => [x, ...lookups.map((m) => m.get(x) ?? null)]),
  };
}

function flatten(nodes: TreeNode[], path: string[] = []): Cell[][] {
  return nodes.flatMap((n) => {
    const here = [...path, n.name];
    const rows: Cell[][] =
      n.value === undefined ? [] : [[here.join(" / "), n.value, n.tag ?? null]];
    return [...rows, ...flatten(n.children ?? [], here)];
  });
}

export function specToTable(spec: ChartSpec): DataTable {
  switch (spec.kind) {
    case "timeseries":
      return joinSeries(spec);
    case "multiples": {
      const parts = spec.items.map((item) => joinSeries(item, `${item.title}: `));
      const xs = orderX([...new Set(parts.flatMap((t) => t.rows.map((r) => String(r[0]))))]);
      const maps = parts.map(
        (t) => new Map(t.rows.map((r) => [String(r[0]), r.slice(1)] as const)),
      );
      return {
        columns: [{ label: "date" }, ...parts.flatMap((t) => t.columns.slice(1))],
        rows: xs.map((x) => [
          x,
          ...maps.flatMap((m, i) => m.get(x) ?? (parts[i]?.columns.slice(1) ?? []).map(() => null)),
        ]),
      };
    }
    case "stacked":
      return {
        columns: [
          { label: "date" },
          ...spec.keys.map((k) => ({ label: k.label, unit: spec.unit })),
        ],
        rows: spec.rows.map((r) => [r.x, ...spec.keys.map((k) => r.values[k.key] ?? null)]),
      };
    case "bars":
      return {
        columns: [{ label: "label" }, { label: "value", unit: spec.unit }, { label: "group" }],
        rows: spec.bars.map((b) => [b.label, b.value, b.group ?? null]),
      };
    case "stackbar":
      return {
        columns: [{ label: "part" }, { label: "value", unit: spec.unit }, { label: "basis" }],
        rows: [
          ...spec.parts.map((p): Cell[] => [p.label, p.value, p.basis]),
          [spec.total.label, spec.total.value, "total"],
        ],
      };
    case "bullet":
      return {
        columns: [
          { label: "metric" },
          { label: "value", unit: spec.unit },
          { label: "target", unit: spec.unit },
        ],
        rows: [[spec.title, spec.value, spec.target?.value ?? null]],
      };
    case "scatter":
      return {
        columns: [
          { label: "id" },
          { label: "label" },
          { label: "group" },
          { label: spec.xLabel, unit: spec.xUnit },
          { label: spec.yLabel, unit: spec.yUnit },
          { label: spec.sizeLabel ?? "size" },
        ],
        rows: spec.points.map((p) => [p.id, p.label, p.group, p.x, p.y, p.size ?? null]),
      };
    case "calendar":
      return {
        columns: [{ label: "date" }, { label: spec.valueLabel, unit: spec.unit }],
        rows: spec.days.map((d) => [d.date, d.value]),
      };
    case "lorenz":
      return {
        columns: [
          { label: "cumulative share of wallets" },
          { label: "cumulative share of points" },
        ],
        rows: spec.points.map((p) => [p.x, p.y]),
      };
    case "gantt":
      return {
        columns: [
          { label: "id" },
          { label: "label" },
          { label: "group" },
          { label: "start" },
          { label: "end" },
          { label: "capital", unit: "usd" },
          { label: "status" },
        ],
        rows: spec.rows.map((r) => [r.id, r.label, r.group, r.start, r.end, r.capital, r.status]),
      };
    case "treemap":
      return {
        columns: [{ label: "path" }, { label: "value", unit: spec.unit }, { label: "tag" }],
        rows: flatten(spec.root),
      };
    case "sankey":
      return {
        columns: [{ label: "from" }, { label: "to" }, { label: "value", unit: spec.unit }],
        rows: spec.links.map((l) => [
          spec.nodes.find((n) => n.id === l.source)?.label ?? l.source,
          spec.nodes.find((n) => n.id === l.target)?.label ?? l.target,
          l.value,
        ]),
      };
    case "waterfall":
      return {
        columns: [{ label: "step" }, { label: "value", unit: spec.unit }, { label: "type" }],
        rows: spec.steps.map((s) => [s.label, s.value, s.type]),
      };
  }
}

function csvCell(cell: Cell): string {
  if (cell === null) return "";
  const text = String(cell);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV of the exact data shown, raw numbers (no units, no rounding), RFC 4180 quoting. */
export function tableToCsv(table: DataTable): string {
  const lines = [table.columns.map((c) => csvCell(c.label)).join(",")];
  for (const row of table.rows) lines.push(row.map(csvCell).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export const specToCsv = (spec: ChartSpec): string => tableToCsv(specToTable(spec));
