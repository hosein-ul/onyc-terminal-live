/**
 * The ONyc Terminal mark: a rounded square with a rising line. The line is computed from an ease-out curve, so the
 * geometry is a formula and not a hand-drawn path. It is a community mark and not the OnRe logo.
 */
const POINTS = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6;
  const x = 7 + t * 16;
  const y = 22 - (1 - (1 - t) ** 2) * 13;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
        <rect width="30" height="30" rx="10" fill="var(--accent)" />
        <polyline
          points={POINTS}
          fill="none"
          stroke="#fff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23" cy="9" r="2.4" fill="#fff" />
      </svg>
      <span className="logo-text">ONyc Terminal</span>
    </span>
  );
}
