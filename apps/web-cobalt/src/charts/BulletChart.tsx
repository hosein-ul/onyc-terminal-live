import { type BulletSpec } from "@onyc/chart-specs";
import { useWidth } from "./useWidth";

const H = 74;
const PAD = 8;

/** A horizontal meter: the value as a bar, the target as a tick. Not a radial gauge. */
export function BulletChart({ spec }: { spec: BulletSpec }) {
  const [ref, W] = useWidth();
  const scale = (v: number): number =>
    PAD + (Math.min(Math.max(v, 0), spec.max) / spec.max) * (W - PAD * 2);
  const target = spec.target;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={spec.summary}
        style={{ display: "block" }}
      >
        <rect x={PAD} y={30} width={W - PAD * 2} height={16} rx={8} fill="var(--chart-grid)" />
        {spec.value !== null && (
          <rect
            x={PAD}
            y={30}
            width={Math.max(4, scale(spec.value) - PAD)}
            height={16}
            rx={8}
            fill="var(--chart-accent)"
          />
        )}
        {target !== null && (
          <g>
            <line
              x1={scale(target.value)}
              x2={scale(target.value)}
              y1={24}
              y2={52}
              stroke="var(--chart-ink)"
              strokeWidth={2}
            />
            <text
              x={scale(target.value)}
              y={68}
              textAnchor="middle"
              fontSize={12}
              fontFamily="var(--chart-font-ui)"
              fill="var(--chart-muted)"
            >
              {target.label}
            </text>
          </g>
        )}
        <text
          x={PAD}
          y={18}
          fontSize={26}
          fontWeight={700}
          fontFamily="var(--chart-font-ui)"
          fill="var(--chart-ink)"
          letterSpacing="-0.02em"
        >
          {spec.valueLabel}
        </text>
        {spec.value === null && (
          <text
            x={PAD + 90}
            y={18}
            fontSize={13}
            fontFamily="var(--chart-font-ui)"
            fill="var(--chart-muted)"
          >
            not available from the source right now
          </text>
        )}
      </svg>
    </div>
  );
}
