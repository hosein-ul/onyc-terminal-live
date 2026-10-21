import { ALERT_RULES } from "@onyc/sdk";
import { formatBps, formatCompact } from "@onyc/format";
import type { RuleParams } from "./commands.js";

export interface EventRow {
  id: number;
  ts: Date;
  kind: string;
  severity: string;
  title: string;
  body: string;
  data: unknown;
}

export interface RuleRow {
  id: number;
  channel: string;
  target: string;
  kind: string;
  params: unknown;
  createdAt: Date;
}

const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Does this event concern this rule? Parameters narrow the match; the worker and the bot only write real events. */
export function matches(
  rule: Pick<RuleRow, "kind" | "params">,
  event: Pick<EventRow, "kind" | "data">,
): boolean {
  const def = ALERT_RULES.find((r) => r.key === rule.kind);
  if (def === undefined) return false;
  const kindMatches = def.eventKind.endsWith("*")
    ? event.kind.startsWith(def.eventKind.slice(0, -1))
    : event.kind === def.eventKind;
  if (!kindMatches) return false;
  const params = record(rule.params);
  const data = record(event.data);
  switch (def.key) {
    case "discount": {
      const premium = num(data["premiumBps"]);
      const bps = num(params["bps"]);
      return premium !== null && bps !== null && premium <= -bps;
    }
    case "apy": {
      const key = typeof data["key"] === "string" ? data["key"].toLowerCase() : "";
      const protocol = typeof params["protocol"] === "string" ? params["protocol"] : "";
      const from = num(data["from"]);
      const to = num(data["to"]);
      const points = num(params["points"]);
      if (protocol === "" || !(key === protocol || key.startsWith(`${protocol}.`))) return false;
      // The event stores fractions (0.05 is 5%); the rule is in percentage points. A missing side counts as a large move.
      return (
        points !== null && (from === null || to === null || Math.abs(to - from) * 100 >= points)
      );
    }
    case "wallet":
      return typeof data["address"] === "string" && data["address"] === params["address"];
    case "redemption": {
      const amount = num(data["amount"]);
      const min = num(params["amount"]);
      return amount !== null && min !== null && amount >= min;
    }
    case "downtick":
    case "layer":
    case "solvency":
      return true;
  }
}

/** "discount: 50 bps" for /list. */
export function describeRule(rule: Pick<RuleRow, "kind" | "params">): string {
  const p = record(rule.params) as RuleParams;
  switch (rule.kind) {
    case "discount":
      return `discount of at least ${formatBps(Number(p["bps"]))}`;
    case "apy":
      return `${String(p["protocol"])} APY moves by ${String(p["points"])} points or more`;
    case "wallet":
      return `rank changes for ${String(p["address"])}`;
    case "redemption":
      return `redemptions of ${formatCompact(Number(p["amount"]))} ONyc or more`;
    case "downtick":
      return "NAV down-ticks";
    case "layer":
      return "reinsurance layer changes";
    case "solvency":
      return "stale proof of reserves";
    default:
      return rule.kind;
  }
}
