import { ALERT_RULES, type AlertRule } from "@onyc/sdk";

export type RuleKey = AlertRule["key"];
export type RuleParams = Record<string, string | number>;

export type Command =
  | { kind: "start" }
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "subscribe"; rule: RuleKey; params: RuleParams }
  | { kind: "unsubscribe"; target: number | "all" }
  | { kind: "webhook"; url: string; rule: RuleKey; params: RuleParams }
  | { kind: "invalid"; message: string };

const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PROTOCOL = /^[a-z0-9][a-z0-9._-]{1,31}$/;

function positive(text: string | undefined, max: number): number | null {
  if (text === undefined || !/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= max ? n : null;
}

/** Turn the words after the rule name into stored parameters, or say what is wrong in a sentence. */
export function parseRuleArgs(
  key: RuleKey,
  args: string[],
): { ok: true; params: RuleParams } | { ok: false; message: string } {
  const rule = ALERT_RULES.find((r) => r.key === key);
  const usage = `Usage: /subscribe ${rule?.usage ?? key}`;
  const expected = (rule?.usage.split(" ").length ?? 1) - 1;
  if (args.length !== expected) return { ok: false, message: usage };
  switch (key) {
    case "discount": {
      const bps = positive(args[0], 10_000);
      return bps === null
        ? { ok: false, message: `${usage}. The number is basis points, above 0.` }
        : { ok: true, params: { bps } };
    }
    case "downtick":
    case "layer":
    case "solvency":
      return { ok: true, params: {} };
    case "apy": {
      const protocol = (args[0] ?? "").toLowerCase();
      const points = positive(args[1], 100);
      if (!PROTOCOL.test(protocol))
        return { ok: false, message: `${usage}. Use a protocol name such as kamino.` };
      return points === null
        ? { ok: false, message: `${usage}. The number is percentage points, above 0.` }
        : { ok: true, params: { protocol, points } };
    }
    case "wallet": {
      const address = args[0] ?? "";
      return SOLANA.test(address)
        ? { ok: true, params: { address } }
        : { ok: false, message: `${usage}. That is not a Solana address.` };
    }
    case "redemption": {
      const amount = positive(args[0], 1e12);
      return amount === null
        ? { ok: false, message: `${usage}. The number is an amount of ONyc, above 0.` }
        : { ok: true, params: { amount } };
    }
  }
}

const isRuleKey = (s: string | undefined): s is RuleKey => ALERT_RULES.some((r) => r.key === s);

/** Parse one Telegram message. Anything that is not a command is `invalid` with a hint, never silently ignored. */
export function parseCommand(text: string): Command {
  const words = text.trim().split(/\s+/);
  // Telegram appends @botname in groups: /subscribe@onyc_bot.
  const head = (words[0] ?? "").toLowerCase().replace(/@\S+$/, "");
  const rest = words.slice(1);
  switch (head) {
    case "/start":
      return { kind: "start" };
    case "/help":
      return { kind: "help" };
    case "/list":
      return { kind: "list" };
    case "/subscribe": {
      const key = rest[0]?.toLowerCase();
      if (!isRuleKey(key))
        return {
          kind: "invalid",
          message: `Say which rule. Rules: ${ALERT_RULES.map((r) => r.key).join(", ")}. Try /help.`,
        };
      const parsed = parseRuleArgs(key, rest.slice(1));
      return parsed.ok
        ? { kind: "subscribe", rule: key, params: parsed.params }
        : { kind: "invalid", message: parsed.message };
    }
    case "/webhook": {
      const url = rest[0];
      const key = rest[1]?.toLowerCase();
      if (url === undefined || !isRuleKey(key))
        return {
          kind: "invalid",
          message: "Usage: /webhook <https url> <rule> [arguments]. Try /help.",
        };
      const parsed = parseRuleArgs(key, rest.slice(2));
      return parsed.ok
        ? { kind: "webhook", url, rule: key, params: parsed.params }
        : { kind: "invalid", message: parsed.message };
    }
    case "/unsubscribe": {
      const target = rest[0]?.toLowerCase();
      if (target === "all") return { kind: "unsubscribe", target: "all" };
      const n = Number(target);
      return Number.isInteger(n) && n > 0
        ? { kind: "unsubscribe", target: n }
        : {
            kind: "invalid",
            message: "Usage: /unsubscribe <number from /list> or /unsubscribe all.",
          };
    }
    default:
      return { kind: "invalid", message: "I did not understand that. Try /help." };
  }
}

export function helpText(): string {
  return [
    "ONyc Terminal alerts (unofficial, read-only; not affiliated with OnRe).",
    "",
    "Subscribe with:",
    ...ALERT_RULES.map((r) => `/subscribe ${r.usage}\n  ${r.description}`),
    "",
    "/list shows your rules, /unsubscribe <number> removes one, /unsubscribe all removes all.",
    "/webhook <https url> <rule> [arguments] sends the same alerts to a URL as signed JSON.",
  ].join("\n");
}
