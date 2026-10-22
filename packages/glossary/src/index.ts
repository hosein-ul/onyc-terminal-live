import { TERMS, TERM_BY_ID, type Term, type TermBasis } from "./terms.js";

export { TERMS, TERM_BY_ID, type Term, type TermBasis };

export interface TextPart {
  text: string;
  /** Set when the text is a glossary term. */
  termId?: string;
}

interface Candidate {
  surface: string;
  id: string;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Spellings of 3 characters or fewer (PT, YT, EL, LTV, bp) match only in the case they are written in. */
const isShort = (s: string): boolean => s.length <= 3;

function candidates(): Candidate[] {
  const list: Candidate[] = [];
  for (const t of TERMS) {
    for (const surface of [t.term, ...t.aliases]) list.push({ surface, id: t.id });
  }
  // Longest first so "liquidity layer coverage" wins over "liquidity layer".
  return list.sort((a, b) => b.surface.length - a.surface.length);
}

const CANDIDATES = candidates();
const BY_SURFACE = new Map<string, string>();
for (const c of CANDIDATES) {
  const key = isShort(c.surface) ? c.surface : c.surface.toLowerCase();
  if (!BY_SURFACE.has(key)) BY_SURFACE.set(key, c.id);
}

const loose = CANDIDATES.filter((c) => !isShort(c.surface)).map((c) => escape(c.surface));
const strict = CANDIDATES.filter((c) => isShort(c.surface)).map((c) => escape(c.surface));
const LOOSE_RE = new RegExp(`(?<![\\w-])(?:${loose.join("|")})(?![\\w-])`, "gi");
const STRICT_RE = new RegExp(`(?<![\\w-])(?:${strict.join("|")})(?![\\w-])`, "g");

interface Hit {
  start: number;
  end: number;
  id: string;
}

function hits(text: string): Hit[] {
  const found: Hit[] = [];
  for (const m of text.matchAll(LOOSE_RE)) {
    const id = BY_SURFACE.get(m[0].toLowerCase());
    if (id !== undefined) found.push({ start: m.index, end: m.index + m[0].length, id });
  }
  for (const m of text.matchAll(STRICT_RE)) {
    const id = BY_SURFACE.get(m[0]);
    if (id !== undefined) found.push({ start: m.index, end: m.index + m[0].length, id });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  // Drop matches that overlap an earlier (longer) one.
  const kept: Hit[] = [];
  for (const h of found) {
    const last = kept[kept.length - 1];
    if (last === undefined || h.start >= last.end) kept.push(h);
  }
  return kept;
}

/**
 * Split a label or sentence into plain text and glossary terms, so a UI can put a "?" after each term.
 * `only` limits the match to the first use of each term: pass the same Set for every string on one page.
 */
export function splitByTerms(text: string, seen?: Set<string>): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const h of hits(text)) {
    if (seen?.has(h.id) === true) continue;
    seen?.add(h.id);
    if (h.start > at) parts.push({ text: text.slice(at, h.start) });
    parts.push({ text: text.slice(h.start, h.end), termId: h.id });
    at = h.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts.length === 0 ? [{ text }] : parts;
}

/** Entries sorted for the glossary page. */
export function sortedTerms(): Term[] {
  return [...TERMS].sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }));
}

export const BASIS_LABEL: Record<TermBasis, string> = {
  onre: "Stated by OnRe",
  method: "This tool's method",
  industry: "General meaning",
};
