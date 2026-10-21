/**
 * The ONyc Terminal mark for the Platinum direction: a brushed-silver tile with the same computed rising line. The line is
 * an ease-out curve, so the geometry is a formula. A community mark, not the OnRe logo.
 */
const POINTS = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6;
  const x = 7 + t * 16;
  const y = 22 - (1 - (1 - t) ** 2) * 13;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <defs>
        <linearGradient id="plat-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3e9f1" />
          <stop offset="1" stopColor="#8c97a8" />
        </linearGradient>
      </defs>
      <rect width="30" height="30" rx="9" fill="url(#plat-tile)" />
      <polyline
        points={POINTS}
        fill="none"
        stroke="#12151b"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="9" r="2.3" fill="#12151b" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-text">ONyc Terminal</span>
    </span>
  );
}
