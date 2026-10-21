import { axisFormatter, formatValue, type BarsSpec } from "@onyc/chart-specs";
import { formatMonthYear } from "@onyc/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";
import { usePrefersReducedMotion } from "./motion";

const tick = { fill: "var(--chart-muted)", fontSize: 12, fontFamily: "var(--chart-font-ui)" };
const R = 8;

const isDate = (s: string): boolean => /^\d{4}-\d{2}(-\d{2})?/.test(s);
const toneColor = (tone: string | undefined, value: number | null, diverging: boolean): string => {
  if (diverging) return (value ?? 0) >= 0 ? "var(--chart-good)" : "var(--chart-bad)";
  if (tone === "bad") return "var(--chart-bad)";
  return "var(--chart-accent)";
};

/** Vertical or horizontal bars, with rounded ends, sign colouring for diverging data and threshold lines. */
export function BarsChart({ spec, height }: { spec: BarsSpec; height?: number }) {
  const motion = !usePrefersReducedMotion();
  const horizontal = spec.orientation === "horizontal";
  const h = height ?? (horizontal ? Math.max(220, spec.bars.length * 30 + 40) : 300);
  const data = spec.bars.map((b) => ({ label: b.label, value: b.value }));
  const dateLabel = axisFormatter(spec.bars.map((b) => b.label));
  const label = (v: string): string =>
    /^\d{4}-\d{2}$/.test(v) ? formatMonthYear(v) : isDate(v) ? dateLabel(v) : v;
  const labelWidth = Math.min(
    200,
    Math.max(100, Math.max(0, ...spec.bars.map((b) => b.label.length)) * 7),
  );
  return (
    <div style={{ width: "100%", height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 12, right: horizontal ? 56 : 12, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid
            horizontal={!horizontal}
            vertical={horizontal}
            stroke="var(--chart-grid)"
          />
          {horizontal ? (
            <>
              <XAxis
                type="number"
                tick={tick}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatValue(v, spec.unit)}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ ...tick, fill: "var(--chart-ink)" }}
                tickLine={false}
                axisLine={false}
                width={labelWidth}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="label"
                tick={tick}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickFormatter={label}
              />
              <YAxis
                tick={tick}
                tickLine={false}
                axisLine={false}
                width={spec.unit === "bps" ? 76 : 60}
                tickFormatter={(v: number) => formatValue(v, spec.unit)}
              />
            </>
          )}
          <Tooltip
            content={<ChartTooltip unit={spec.unit} dates={!horizontal} />}
            cursor={{ fill: "var(--chart-grid)", opacity: 0.6 }}
          />
          {spec.diverging && (
            <ReferenceLine {...(horizontal ? { x: 0 } : { y: 0 })} stroke="var(--chart-muted)" />
          )}
          {spec.thresholds.map((t) => (
            <ReferenceLine
              key={t.label}
              {...(horizontal ? { x: t.y } : { y: t.y })}
              stroke="var(--chart-muted)"
              strokeDasharray="4 4"
              strokeOpacity={0.55}
            />
          ))}
          <Bar
            dataKey="value"
            name={spec.title}
            radius={horizontal ? [0, R, R, 0] : [R, R, 0, 0]}
            maxBarSize={horizontal ? 18 : 40}
            isAnimationActive={motion}
            animationDuration={250}
            label={
              horizontal
                ? {
                    position: "right",
                    fill: "var(--chart-ink)",
                    fontSize: 12,
                    formatter: (v: unknown) =>
                      formatValue(typeof v === "number" ? v : null, spec.unit),
                  }
                : false
            }
          >
            {spec.bars.map((b, i) => (
              <Cell key={`${b.label}${i}`} fill={toneColor(b.tone, b.value, spec.diverging)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
