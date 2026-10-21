/**
 * The alert rules a person can subscribe to. One list, used by the Telegram bot to parse commands and by the web apps to
 * document them, so the two cannot drift apart.
 */
export interface AlertRule {
  /** Stable key, also stored with the subscription. */
  key: "discount" | "downtick" | "layer" | "apy" | "solvency" | "wallet" | "redemption";
  /** What the user types after /subscribe. */
  usage: string;
  /** A working example. */
  example: string;
  /** What triggers the alert, in a sentence. */
  description: string;
  /**
   * The event kind in the `events` feed that this rule listens to. A trailing `*` matches a prefix. `bot` rules have no
   * worker event: the bot derives them from the API (wallet rank from the leaderboard, large redemptions from the log).
   */
  eventKind: string;
  source: "events" | "bot";
}

export const ALERT_RULES: readonly AlertRule[] = [
  {
    key: "discount",
    usage: "discount <bps>",
    example: "/subscribe discount 50",
    description: "ONyc trades at least this many basis points below its NAV.",
    eventKind: "discount_breach",
    source: "events",
  },
  {
    key: "downtick",
    usage: "downtick",
    example: "/subscribe downtick",
    description: "The daily NAV goes down, or steps by an unusual amount.",
    eventKind: "nav_downtick",
    source: "events",
  },
  {
    key: "layer",
    usage: "layer",
    example: "/subscribe layer",
    description: "A reinsurance layer appears, changes status or passes its renewal month.",
    eventKind: "layer_*",
    source: "events",
  },
  {
    key: "apy",
    usage: "apy <protocol> <points>",
    example: "/subscribe apy kamino 2",
    description: "An opportunity's APY moves by at least this many percentage points.",
    eventKind: "opportunity_apy_change",
    source: "events",
  },
  {
    key: "solvency",
    usage: "solvency",
    example: "/subscribe solvency",
    description:
      "The proof of reserves is older than expected, or reserves no longer cover supply.",
    eventKind: "solvency_stale",
    source: "events",
  },
  {
    key: "wallet",
    usage: "wallet <address>",
    example: "/subscribe wallet DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh",
    description: "That wallet's points rank changes.",
    eventKind: "wallet_rank",
    source: "bot",
  },
  {
    key: "redemption",
    usage: "redemption <amount>",
    example: "/subscribe redemption 1000000",
    description: "A redemption at least this large is requested or executed.",
    eventKind: "large_redemption",
    source: "bot",
  },
] as const;
