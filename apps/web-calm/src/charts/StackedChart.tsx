import { axisFormatter, formatValue, type StackedSpec } from "@onyc/chart-specs";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  usePlotArea,
  useYAxisScale,
  XAxis,
  YAxis,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";
import { setCrosshair, useCrosshair } from "./crosshair";
import { usePrefersReducedMotion } from "./motion";

const tick = { fill: "var(--chart-muted)", fontSize: 12, fontFamily: "var(--chart-font-ui)" };
const colorOf = (i: number): string => `var(--chart-s${(i % 8) + 1})`;

/** Series names at the right edge of the stack, in place of a legend. Pushed apart so they never overlap. */
function EdgeLabels({ spec, last }: { spec: StackedSpec; last: Record<string, number> }) {
  const area = usePlotArea();
  const scale = useYAxisScale();
  if (area === undefined || scale === undefined) return null;
  const total = spec.mode === "percent" ? 1 : undefined;
  const sum = Object.values(last).reduce((a, b) => a + b, 0);
  let cumulative = 0;
  const raw = spec.keys.map((k, i) => {
    const v = last[k.key] ?? 0;
    const mid = cumulative + v / 2;
    cumulative += v;
    const y = scale(total === undefined ? mid : mid / (sum || 1));
    return {
      key: k.key,
      label: k.label,
      y: typeof y === "number" ? y : 0,
      share: sum > 0 ? v / sum : 0,
      i,
    };
  });
  // Largest stack at the bottom, so sort top to bottom by y and keep 14 px between labels.
  const placed = [...raw].sort((a, b) => a.y - b.y);
  for (let n = 1; n < placed.length; n += 1) {
    const prev = placed[n - 1];
    const cur = placed[n];
    if (prev !== undefined && cur !== undefined && cur.y - prev.y < 15) cur.y = prev.y + 15;
  }
  const x = area.x + area.width + 10;
  return (
    <g>
      {placed.map((p) => (
        <g key={p.key}>
          <circle cx={x + 4} cy={p.y} r={4} fill={colorOf(p.i)} />
          <text
            x={x + 14}
            y={p.y}
            dy="0.35em"
            fontSize={12}
            fontFamily="var(--chart-font-ui)"
            fill="var(--chart-ink)"
          >
            {p.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Stacked area, absolute or 100%, drawn with Recharts. Series are labelled at the right edge, largest at the bottom. */
export function StackedChart({ spec, height = 320 }: { spec: StackedSpec; height?: number }) {
  const motion = !usePrefersReducedMotion();
  const hover = useCrosshair();
  const rows = useMemo(() => spec.rows.map((r) => ({ x: r.x, ...r.values })), [spec.rows]);
  const lastRow = spec.rows[spec.rows.length - 1];
  // Largest first in the spec; drawn from the bottom up, so the largest sits at the bottom.
  const order = [...spec.keys];
  const xKnown = hover !== null && rows.some((r) => r.x === hover);

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={rows}
          stackOffset={spec.mode === "percent" ? "expand" : "none"}
          margin={{ top: 12, right: 132, left: 0, bottom: 0 }}
          onMouseMove={(s) =>
            setCrosshair(typeof s.activeLabel === "string" ? s.activeLabel : null)
          }
          onMouseLeave={() => setCrosshair(null)}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="x"
            tick={tick}
            tickLine={false}
            axisLine={false}
            minTickGap={56}
            tickFormatter={axisFormatter(rows.map((r) => r.x))}
          />
          <YAxis
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) =>
              spec.mode === "percent" ? formatValue(v, "pct") : formatValue(v, spec.unit)
            }
          />
          <Tooltip
            content={<ChartTooltip unit={spec.unit} asShare={spec.mode === "percent"} />}
            cursor={{ stroke: "var(--chart-muted)", strokeDasharray: "3 3" }}
          />
          {order.map((k, i) => (
            <Area
              key={k.key}
              dataKey={k.key}
              name={k.label}
              stackId="capital"
              type="linear"
              stroke="var(--chart-surface)"
              strokeWidth={1}
              fill={colorOf(i)}
              fillOpacity={0.94}
              isAnimationActive={motion}
              animationDuration={250}
            />
          ))}
          {xKnown && <ReferenceLine x={hover} stroke="var(--chart-ink)" strokeDasharray="3 3" />}
          {lastRow !== undefined && <EdgeLabels spec={spec} last={lastRow.values} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
