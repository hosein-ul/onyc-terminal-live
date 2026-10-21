/**
 * In Pastel Blocks colour means topic and nothing else: NAV and market are sky, yield is mint, capital and the book are rose,
 * points and wallets are lilac, costs are butter. Each page sets one topic and its blocks take that colour.
 */
export type Topic = "sky" | "mint" | "rose" | "lilac" | "butter" | "block" | "dark";

const BY_PATH: [string, Topic][] = [
  ["/nav", "sky"],
  ["/market", "sky"],
  ["/reinsurance", "rose"],
  ["/capital", "rose"],
  ["/points", "lilac"],
  ["/wallet", "lilac"],
  ["/risk", "butter"],
  ["/health", "block"],
  ["/activity", "block"],
  ["/developers", "dark"],
];

export function topicFor(pathname: string): Topic {
  return BY_PATH.find(([p]) => pathname.startsWith(p))?.[1] ?? "sky";
}
