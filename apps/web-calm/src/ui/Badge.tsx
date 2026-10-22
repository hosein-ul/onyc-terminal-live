import type { ReactNode } from "react";
import manifest from "../assets/manifest.json";

export type BadgeKind = "protocol" | "token";

const PROTOCOLS = manifest.protocols as Record<string, string>;
const TOKENS = manifest.tokens as Record<string, string>;

/** "Kamino Lend", "kamino" and "Kamino Multiply" all resolve to the Kamino logo; PT-srONyc keeps its own. */
function keyOf(name: string): string {
  const n = name.trim().toLowerCase();
  const compact = n.replace(/[^a-z0-9]+/g, "-");
  const first = n.split(/[^a-z0-9]+/)[0] ?? n;
  return PROTOCOLS[compact] !== undefined || TOKENS[compact] !== undefined ? compact : first;
}

/** A calm pair of colours for the monogram, picked from the name so the same name always looks the same. */
const MONOGRAM = ["#faf1c4", "#ebebe6", "#e2ecf0", "#efe6e0", "#e4eadf"];
function monogramColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return MONOGRAM[h % MONOGRAM.length] ?? MONOGRAM[0] ?? "#ebebe6";
}

export function logoUrl(name: string, kind: BadgeKind): string | null {
  const k = keyOf(name);
  return (kind === "protocol" ? PROTOCOLS[k] : TOKENS[k]) ?? PROTOCOLS[k] ?? TOKENS[k] ?? null;
}

/**
 * A rounded chip with the logo of a protocol or token, self-hosted (docs/ASSETS.md). Without a logo it draws a monogram.
 * The image has alt text; the badge is decorative next to the name, so the name stays the accessible text.
 */
export function Badge({
  name,
  kind = "protocol",
  size = 22,
}: {
  name: string;
  kind?: BadgeKind;
  size?: number;
}) {
  const url = logoUrl(name, kind);
  const style = { width: size, height: size };
  if (url !== null) {
    return (
      <span className="badge" style={style}>
        <img
          src={url}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }
  const letters = name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      className="badge badge-mono"
      style={{ ...style, background: monogramColor(name), fontSize: Math.round(size * 0.42) }}
      role="img"
      aria-label={`${name} (no logo available)`}
    >
      {letters === "" ? "?" : letters}
    </span>
  );
}

/** A name with its badge in front of it. */
export function Named({
  name,
  kind = "protocol",
  size = 20,
  children,
}: {
  name: string;
  kind?: BadgeKind;
  size?: number;
  children?: ReactNode;
}) {
  return (
    <span className="named">
      <Badge name={name} kind={kind} size={size} />
      <span>{children ?? name}</span>
    </span>
  );
}
