/**
 * The Cobalt wordmark: lower-case, heavy, tight. The mark is a rising line computed from an ease-out curve inside a
 * white disc. A community mark, not the OnRe logo.
 */
const POINTS = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6;
  return `${(7 + t * 16).toFixed(1)},${(22 - (1 - (1 - t) ** 2) * 13).toFixed(1)}`;
}).join(" ");

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
        <circle cx="15" cy="15" r="15" fill="#fff" />
        <polyline
          points={POINTS}
          fill="none"
          stroke="#1535e8"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="logo-text">onyc terminal</span>
    </span>
  );
}
