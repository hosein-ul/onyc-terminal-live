import { formatSourceFooter } from "@onyc/format";
import type { Meta } from "@onyc/sdk";
import type { Provenance } from "./types.js";

/**
 * Combine the `meta` entries behind a chart into one provenance. The footer shows the oldest fetch, so a chart
 * built from several datasets is never presented as fresher than its stalest input.
 */
export function provenanceFrom(meta: Record<string, Meta>, ...keys: string[]): Provenance {
  const entries = keys.map((key) => meta[key]).filter((m): m is Meta => m !== undefined);
  if (entries.length === 0) return { source: "Unknown source", fetchedAt: null, stale: true };
  const sources = [...new Set(entries.map((m) => m.source))];
  const times = entries.map((m) => m.fetchedAt);
  const fetchedAt = times.some((t) => t === null)
    ? null
    : (times.filter((t): t is string => t !== null).sort()[0] ?? null);
  return {
    source: sources.join(" + "),
    fetchedAt,
    stale: entries.some((m) => m.stale),
  };
}

/** "Source: OnRe core API · updated 42 s ago". */
export function footerText(p: Provenance, now: Date = new Date()): string {
  return formatSourceFooter(p.source, p.fetchedAt, now);
}
