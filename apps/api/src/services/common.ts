import type { Kpi } from "@onyc/sdk";
import type { DatasetKey } from "../meta.js";

/** What a service returns: the payload plus which dataset each top-level field comes from. */
export interface ServiceResult<T> {
  data: T;
  fields: Record<string, DatasetKey>;
}

export const result = <T>(data: T, fields: Record<string, DatasetKey>): ServiceResult<T> => ({
  data,
  fields,
});

export const num = (value: number | null | undefined): number | null =>
  value === null || value === undefined || !Number.isFinite(value) ? null : value;

export type ChangeMode = "fraction" | "absolute";

/**
 * Build a KPI from a dated series (oldest first) and the current value. `change` compares the current value with
 * the first value in the window. When fewer than `period` days of data exist the KPI says since when it has any.
 */
export function buildKpi(
  current: number | null,
  series: readonly { date: string; value: number | null }[],
  mode: ChangeMode,
  period = "30d",
  periodDays = 30,
): Kpi {
  const points = series.slice(-periodDays);
  const first = points.find((p) => p.value !== null)?.value ?? null;
  let change: number | null = null;
  if (current !== null && first !== null) {
    change = mode === "fraction" ? (first === 0 ? null : current / first - 1) : current - first;
  }
  const firstDate = series.find((p) => p.value !== null)?.date ?? null;
  const short = points.length < periodDays - 2;
  return {
    value: current,
    change,
    changeMode: mode === "fraction" ? "relative" : "absolute",
    period,
    sparkline: points.map((p) => p.value),
    historySince: short ? firstDate : null,
  };
}

/** Thin a long series to at most `max` points by keeping every k-th point and the last. */
export function thin<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const step = Math.ceil(items.length / max);
  const out = items.filter((_, i) => i % step === 0);
  const last = items.at(-1);
  if (last !== undefined && out.at(-1) !== last) out.push(last);
  return out;
}
