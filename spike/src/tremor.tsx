import { AreaChart } from "@tremor/react";
import type { CapitalData, NavData } from "./data";
import { nav6, usd } from "./tok";

// Tremor takes Tailwind colour names; s1..s7 and "accent" are mapped to the skin's CSS variables in tailwind.config.js.
// Tremor has no annotation, reference-point or end-label API, so the NAV chart shows line + tooltip only.
export function TremorNav({ d }: { d: NavData }) {
  const s = d.series;
  return (
    <AreaChart
      className="h-full"
      data={s.map((p) => ({ date: p.date, NAV: p.nav }))}
      index="date"
      categories={["NAV"]}
      colors={["accent"]}
      valueFormatter={nav6}
      showLegend={false}
      showAnimation={false}
      curveType="monotone"
      yAxisWidth={48}
      minValue={Math.min(...s.map((p) => p.nav)) * 0.998}
      maxValue={Math.max(...s.map((p) => p.nav)) * 1.002}
      autoMinValue
      tickGap={48}
    />
  );
}

export function TremorCapital({ d }: { d: CapitalData }) {
  const keys = [...d.keys].reverse();
  return (
    <AreaChart
      className="h-full"
      data={d.rows}
      index="date"
      categories={keys}
      colors={keys.map((_, i) => `s${keys.length - i}`)}
      stack
      valueFormatter={usd}
      showLegend={false}
      showAnimation={false}
      curveType="monotone"
      yAxisWidth={48}
      tickGap={48}
    />
  );
}
