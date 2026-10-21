import type { BulletSpec } from "@onyc/chart-specs";

const SIZE = 200;
const R = 78;
const C = 2 * Math.PI * R;

/**
 * Progress ring for a single ratio, Platinum's signature (docs/DESIGN.md §4). Not used for shares of a whole: those are
 * bars. The target is a tick across the ring; the number sits in the middle in the light display weight.
 */
export function RingChart({ spec }: { spec: BulletSpec }) {
  const frac = spec.value === null ? 0 : Math.min(1, Math.max(0, spec.value / spec.max));
  const target = spec.target === null ? null : Math.min(1, spec.target.value / spec.max);
  const angle = (f: number): number => -90 + f * 360;
  const point = (f: number, radius: number): [number, number] => {
    const a = (angle(f) * Math.PI) / 180;
    return [SIZE / 2 + radius * Math.cos(a), SIZE / 2 + radius * Math.sin(a)];
  };
  const [tx1, ty1] = target === null ? [0, 0] : point(target, R - 10);
  const [tx2, ty2] = target === null ? [0, 0] : point(target, R + 10);
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE + 28}`}
      width="100%"
      role="img"
      aria-label={spec.summary}
      style={{ display: "block", maxWidth: 260, margin: "0 auto" }}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="var(--chart-grid)"
        strokeWidth={10}
      />
      {spec.value !== null && (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--chart-accent)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${C * frac} ${C}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      )}
      {target !== null && (
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="var(--chart-ink)" strokeWidth={2} />
      )}
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 12}
        textAnchor="middle"
        fontSize={spec.valueLabel.length > 6 ? 30 : 38}
        fontWeight={300}
        fontFamily="var(--chart-font-ui)"
        fill="var(--chart-primary)"
      >
        {spec.valueLabel}
      </text>
      {spec.target !== null && (
        <text
          x={SIZE / 2}
          y={SIZE + 22}
          textAnchor="middle"
          fontSize={13}
          fontFamily="var(--chart-font-ui)"
          fill="var(--chart-muted)"
        >
          {spec.target.label}
        </text>
      )}
    </svg>
  );
}
