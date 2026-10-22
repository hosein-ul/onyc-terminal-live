import { formatBps, formatUsdCompact } from "@onyc/format";

export interface HeadlineInput {
  /** Days in the last 30 on which NAV fell. null when NAV history is not loaded. */
  navDownticks30d: number | null;
  /** NAV change over 30 days as a fraction. */
  navReturn30d: number | null;
  /** Money in minus money out over 30 days, USD (negative means outflow). */
  netFlow30dUsd: number | null;
  aumUsd: number | null;
  /** Market premium (positive) or discount (negative) against NAV, in bps. */
  premiumBps: number | null;
  /** Age of the proof-of-solvency report in hours. */
  solvencyAgeHours: number | null;
  topProtocol: { name: string; share: number } | null;
}

export interface Headline {
  text: string;
  tone: "good" | "watch" | "bad";
  /** Which fact the second half is about, for tests and for linking to the right section. */
  concern: "none" | "outflow" | "discount" | "solvency" | "concentration" | "nav";
}

/** Limits that decide what is worth a headline. They are this tool's, and the same ones the safety board shows. */
export const HEADLINE_LIMITS = {
  /** Outflow of this share of AUM over 30 days. */
  outflowShare: 0.03,
  /** Discount in bps. */
  discountBps: 25,
  /** Hours before a solvency report is called old. */
  solvencyAgeHours: 72,
  /** Share of capital in one protocol. */
  topProtocolShare: 0.5,
} as const;

const days = (hours: number): string => {
  const d = Math.round(hours / 24);
  return d <= 1 ? "a day" : `${d} days`;
};

/**
 * One sentence about the most important fact now, built only from the numbers passed in: how NAV is behaving, then the
 * biggest concern if there is one. Nothing is written when the inputs are missing.
 */
export function buildHeadline(i: HeadlineInput): Headline {
  const nav =
    i.navDownticks30d === null
      ? null
      : i.navDownticks30d === 0
        ? i.navReturn30d !== null && i.navReturn30d < 0
          ? "NAV is lower than 30 days ago"
          : "NAV keeps rising with no down-ticks"
        : `NAV fell on ${i.navDownticks30d} day${i.navDownticks30d === 1 ? "" : "s"} in the last 30`;

  const outflowBig =
    i.netFlow30dUsd !== null &&
    i.aumUsd !== null &&
    i.aumUsd > 0 &&
    -i.netFlow30dUsd / i.aumUsd >= HEADLINE_LIMITS.outflowShare;

  let concern: Headline["concern"] = "none";
  let clause = "";
  if (outflowBig && i.netFlow30dUsd !== null) {
    concern = "outflow";
    clause = `${formatUsdCompact(Math.abs(i.netFlow30dUsd))} left in 30 days`;
  } else if (i.premiumBps !== null && -i.premiumBps >= HEADLINE_LIMITS.discountBps) {
    concern = "discount";
    clause = `the market price is ${formatBps(Math.abs(i.premiumBps))} below NAV`;
  } else if (
    i.solvencyAgeHours !== null &&
    i.solvencyAgeHours >= HEADLINE_LIMITS.solvencyAgeHours
  ) {
    concern = "solvency";
    clause = `the proof of solvency is ${days(i.solvencyAgeHours)} old`;
  } else if (i.topProtocol !== null && i.topProtocol.share >= HEADLINE_LIMITS.topProtocolShare) {
    concern = "concentration";
    clause = `${Math.round(i.topProtocol.share * 100)}% of capital sits in ${i.topProtocol.name}`;
  }

  if (nav === null) {
    return clause === ""
      ? { text: "ONyc at a glance", tone: "watch", concern: "none" }
      : { text: capitalise(clause), tone: "watch", concern };
  }
  if (i.navDownticks30d !== null && i.navDownticks30d > 0) {
    return {
      text: clause === "" ? nav : `${nav}, and ${clause}`,
      tone: "bad",
      concern: clause === "" ? "nav" : concern,
    };
  }
  if (clause === "") {
    return { text: `${nav}, and nothing else is flagged`, tone: "good", concern: "none" };
  }
  return { text: `${nav}, but ${clause}`, tone: "watch", concern };
}

const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
