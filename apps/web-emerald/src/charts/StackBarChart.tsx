import { formatValue, type StackBarSpec } from "@onyc/chart-specs";
import { formatPercent } from "@onyc/format";
import { useWidth } from "./useWidth";

const BAR_H = 40;
const GAP = 4;
const ROW = 28;

/** One horizontal bar split into parts that must add up to the total, with the sum check printed under it. */
export function StackBarChart({ spec }: { spec: StackBarSpec }) {
  const [ref, W] = useWidth();
  const total = spec.total.value || 1;
  const usable = W - GAP * (spec.parts.length - 1);
  let x = 0;
  const segments = spec.parts.map((p, i) => {
    const width = Math.max(2, (p.value / total) * usable);
    const seg = { ...p, x, width, i };
    x += width + GAP;
    return seg;
  });
  const listTop = BAR_H + 22;
  const height = listTop + spec.parts.length * ROW + 58;
  const { sumCheck } = spec;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width={W}
        height={height}
        role="img"
        aria-label={spec.summary}
        style={{ display: "block" }}
      >
        {segments.map((s) => (
          <rect
            key={s.key}
            x={s.x}
            y={0}
            width={s.width}
            height={BAR_H}
            rx={10}
            fill={`var(--chart-s${s.i + 1})`}
          />
        ))}
        {segments.map((s, row) => (
          <g key={`l${s.key}`} transform={`translate(0 ${listTop + row * ROW})`}>
            <circle cx={6} cy={8} r={5} fill={`var(--chart-s${s.i + 1})`} />
            <text
              x={20}
              y={12}
              fontSize={14}
              fontFamily="var(--chart-font-ui)"
              fill="var(--chart-ink)"
            >
              {s.label}
            </text>
            <text
              x={W - 64}
              y={12}
              fontSize={14}
              fontWeight={600}
              textAnchor="end"
              fontFamily="var(--chart-font-ui)"
              fill="var(--chart-ink)"
            >
              {formatValue(s.value, spec.unit)}
            </text>
            <text
              x={W}
              y={12}
              fontSize={14}
              textAnchor="end"
              fontFamily="var(--chart-font-ui)"
              fill="var(--chart-muted)"
            >
              {formatPercent(s.value / total, 1)}
            </text>
          </g>
        ))}
        <line
          x1={0}
          x2={W}
          y1={listTop + spec.parts.length * ROW + 4}
          y2={listTop + spec.parts.length * ROW + 4}
          stroke="var(--chart-line)"
        />
        <text
          x={0}
          y={listTop + spec.parts.length * ROW + 26}
          fontSize={13}
          fontFamily="var(--chart-font-ui)"
          fill="var(--chart-muted)"
        >{`Parts sum to ${formatValue(sumCheck.sum, spec.unit)}; ${spec.total.label} is ${formatValue(sumCheck.total, spec.unit)}`}</text>
        <text
          x={0}
          y={listTop + spec.parts.length * ROW + 46}
          fontSize={13}
          fontFamily="var(--chart-font-ui)"
          fill="var(--chart-muted)"
        >{`Difference ${formatValue(sumCheck.difference, spec.unit)}${sumCheck.ok ? " (matches)" : " (does not match)"}`}</text>
      </svg>
    </div>
  );
}
