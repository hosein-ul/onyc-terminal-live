import { formatValue, type BarsSpec } from "@onyc/chart-specs";
import { formatDate, formatMonthYear } from "@onyc/format";
import { BarChart, BarList } from "@tremor/react";
import { usePrefersReducedMotion } from "./motion";

const labelOf = (v: string): string =>
  /^\d{4}-\d{2}$/.test(v) ? formatMonthYear(v) : /^\d{4}-\d{2}-\d{2}/.test(v) ? formatDate(v) : v;

/**
 * Tremor for the simple bar charts: ranked horizontal bars as a bar list, vertical bars (also diverging) as a bar chart.
 * Charts that need threshold lines go to the Recharts adapter instead, because Tremor has no reference lines.
 */
export function TremorBars({ spec }: { spec: BarsSpec }) {
  const motion = !usePrefersReducedMotion();
  if (spec.orientation === "horizontal") {
    return (
      <BarList
        className="ch-barlist"
        data={spec.bars.map((b) => ({ name: b.label, value: b.value ?? 0 }))}
        valueFormatter={(v: number) => formatValue(v, spec.unit)}
        color="s8"
        showAnimation={motion}
      />
    );
  }
  const diverging = spec.diverging;
  const data = spec.bars.map((b) =>
    diverging
      ? {
          label: labelOf(b.label),
          Premium: Math.max(0, b.value ?? 0),
          Discount: Math.min(0, b.value ?? 0),
        }
      : { label: labelOf(b.label), [spec.title]: b.value ?? 0 },
  );
  return (
    <BarChart
      className="ch-tremor-bars"
      data={data}
      index="label"
      categories={diverging ? ["Premium", "Discount"] : [spec.title]}
      colors={diverging ? ["accent", "bad"] : ["accent"]}
      stack={diverging}
      valueFormatter={(v: number) => formatValue(v, spec.unit)}
      showLegend={false}
      showAnimation={motion}
      animationDuration={250}
      yAxisWidth={diverging && spec.unit === "bps" ? 76 : 64}
      tickGap={24}
    />
  );
}
