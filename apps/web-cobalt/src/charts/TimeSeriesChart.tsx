import { axisFormatter, formatValue, orderX, type TimeSeriesSpec } from "@onyc/chart-specs";
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Label,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";
import { setCrosshair, useCrosshair } from "./crosshair";
import { usePrefersReducedMotion } from "./motion";

const tick = { fill: "var(--chart-muted)", fontSize: 12, fontFamily: "var(--chart-font-mono)" };
const tone = {
  good: "var(--chart-good)",
  bad: "var(--chart-bad)",
  accent: "var(--chart-accent)",
  neutral: "var(--chart-muted)",
} as const;

const EVENT_LABEL = {
  accent: "New price vector",
  bad: "Down-tick",
  neutral: "Outlier step",
} as const;

type Row = { x: string } & Record<string, number | string | null | [number, number]>;

/** Line and area charts for ordinary time series, drawn with Recharts and skinned from the --chart-* tokens. */
export function TimeSeriesChart({ spec, height = 300 }: { spec: TimeSeriesSpec; height?: number }) {
  const motion = !usePrefersReducedMotion();
  const hover = useCrosshair();

  const { rows, lo, hi } = useMemo(() => {
    const xs = orderX([...new Set(spec.series.flatMap((s) => s.points.map((p) => p.x)))]);
    const byKey = spec.series.map((s) => new Map(s.points.map((p) => [p.x, p.y] as const)));
    let min = Infinity;
    let max = -Infinity;
    const built: Row[] = xs.map((x) => {
      const row: Row = { x };
      spec.series.forEach((s, i) => {
        const y = byKey[i]?.get(x) ?? null;
        row[s.key] = y;
        if (y !== null) {
          min = Math.min(min, y);
          max = Math.max(max, y);
        }
      });
      if (spec.spread !== undefined) {
        const a = row[spec.spread.a];
        const b = row[spec.spread.b];
        if (typeof a === "number" && typeof b === "number") {
          row["__pos"] = a >= b ? [b, a] : null;
          row["__neg"] = a < b ? [a, b] : null;
        }
      }
      return row;
    });
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.01 || 1;
    return {
      rows: built,
      lo: spec.zeroBased ? 0 : Math.max(spec.floor ?? Number.NEGATIVE_INFINITY, min - pad),
      hi: max + pad,
    };
  }, [spec]);

  const fmtX = useMemo(() => axisFormatter(rows.map((r) => r.x)), [rows]);
  const compact = spec.compact === true;
  const primary = spec.series.find((s) => s.role === "primary") ?? spec.series[0];
  const xKnown = hover !== null && rows.some((r) => r.x === hover);

  // Say what the rings on the line are, so none of them reads as a stray data point.
  const eventKinds = (["accent", "bad", "neutral"] as const).flatMap((k) => {
    const n = spec.annotations.filter((a) => a.kind === "event" && a.y !== null && a.tone === k);
    return n.length === 0 ? [] : [{ tone: k, count: n.length, label: EVENT_LABEL[k] }];
  });

  return (
    <div style={{ width: "100%" }}>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{
              top: 16,
              right: spec.annotations.some((a) => a.kind === "end") ? 64 : 12,
              left: 0,
              bottom: 0,
            }}
            onMouseMove={(s) =>
              setCrosshair(typeof s.activeLabel === "string" ? s.activeLabel : null)
            }
            onMouseLeave={() => setCrosshair(null)}
            accessibilityLayer
          >
            <defs>
              <linearGradient id={`fill-${spec.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--chart-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {!compact && <CartesianGrid vertical={false} stroke="var(--chart-grid)" />}
            <XAxis
              dataKey="x"
              hide={compact}
              tick={tick}
              tickLine={false}
              axisLine={false}
              minTickGap={56}
              tickFormatter={fmtX}
            />
            <YAxis
              hide={compact}
              domain={spec.logScale === true ? ["auto", "auto"] : [lo, hi]}
              scale={spec.logScale === true ? "log" : "auto"}
              allowDataOverflow
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={spec.unit === "bps" ? 76 : 60}
              tickCount={5}
              tickFormatter={(v: number) => formatValue(v, spec.unit)}
            />
            {!compact && (
              <Tooltip
                content={<ChartTooltip unit={spec.unit} hide={["__pos", "__neg"]} />}
                cursor={{ stroke: "var(--chart-muted)", strokeDasharray: "3 3" }}
              />
            )}
            {spec.spread !== undefined && (
              <>
                <Area
                  dataKey="__pos"
                  stroke="none"
                  fill="var(--chart-good)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  legendType="none"
                />
                <Area
                  dataKey="__neg"
                  stroke="none"
                  fill="var(--chart-bad)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  legendType="none"
                />
              </>
            )}
            {spec.series.map((s) =>
              s.role === "primary" && spec.variant === "area" ? (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke="var(--chart-primary)"
                  strokeWidth={compact ? 2 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={`url(#fill-${spec.id})`}
                  dot={false}
                  connectNulls
                  isAnimationActive={motion}
                  animationDuration={250}
                  activeDot={{
                    r: 5,
                    fill: "var(--chart-accent)",
                    stroke: "var(--chart-surface)",
                    strokeWidth: 2,
                  }}
                />
              ) : (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke={s.role === "primary" ? "var(--chart-primary)" : "var(--chart-muted)"}
                  strokeWidth={s.role === "primary" ? (compact ? 2 : 3) : 2}
                  {...(s.role === "reference" ? { strokeDasharray: "5 4" } : {})}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  connectNulls
                  isAnimationActive={motion}
                  animationDuration={250}
                  activeDot={{
                    r: 5,
                    fill: "var(--chart-accent)",
                    stroke: "var(--chart-surface)",
                    strokeWidth: 2,
                  }}
                />
              ),
            )}
            {xKnown && (
              <ReferenceLine x={hover} stroke="var(--chart-muted)" strokeDasharray="3 3" />
            )}
            {spec.annotations.map((a, i) => {
              if (a.kind === "threshold") {
                return (
                  <ReferenceLine key={`t${i}`} y={a.y} stroke={tone[a.tone]} strokeDasharray="4 4">
                    <Label
                      value={a.label}
                      position="insideTopRight"
                      fill="var(--chart-muted)"
                      fontSize={11}
                    />
                  </ReferenceLine>
                );
              }
              if (a.kind === "event") {
                if (a.y === null) return null;
                return (
                  <ReferenceDot
                    key={`e${i}`}
                    x={a.x}
                    y={a.y}
                    r={3.5}
                    fill="var(--chart-surface)"
                    stroke={tone[a.tone]}
                    strokeWidth={2}
                  >
                    <title>{a.label}</title>
                  </ReferenceDot>
                );
              }
              return (
                <ReferenceDot
                  key={`end${i}`}
                  x={a.x}
                  y={a.y}
                  r={6}
                  fill="var(--chart-accent)"
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                >
                  <Label
                    value={a.label}
                    position="right"
                    offset={10}
                    fill="var(--chart-ink)"
                    fontSize={13}
                    fontWeight={600}
                  />
                </ReferenceDot>
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
        <span className="sr-only">{primary?.label}</span>
      </div>
      {eventKinds.length > 0 && (
        <ul className="chart-key" aria-label="Markers on the line">
          {eventKinds.map((k) => (
            <li key={k.tone}>
              <i style={{ borderColor: tone[k.tone] }} aria-hidden="true" />
              {k.label} <span>{k.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
