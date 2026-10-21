import { describe, expect, it } from "vitest";
import { ALERT_RULES } from "./alerts.js";

describe("ALERT_RULES", () => {
  it("has one rule per key", () => {
    const keys = ALERT_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "discount",
      "downtick",
      "layer",
      "apy",
      "solvency",
      "wallet",
      "redemption",
    ]);
  });

  it("gives every rule a working example that matches its usage", () => {
    for (const rule of ALERT_RULES) {
      const example = rule.example.split(" ");
      expect(example[0], rule.key).toBe("/subscribe");
      expect(example[1], rule.key).toBe(rule.usage.split(" ")[0]);
      // Same number of arguments as the usage line shows.
      expect(example.length - 1, rule.key).toBe(rule.usage.split(" ").length);
    }
  });

  it("points rules at real event kinds, or marks them as derived by the bot", () => {
    const eventKinds = new Set([
      "discount_breach",
      "nav_downtick",
      "layer_*",
      "opportunity_apy_change",
      "solvency_stale",
    ]);
    for (const rule of ALERT_RULES) {
      if (rule.source === "events") expect(eventKinds.has(rule.eventKind), rule.key).toBe(true);
      else expect(["wallet_rank", "large_redemption"]).toContain(rule.eventKind);
    }
  });

  it("describes every rule in a sentence", () => {
    for (const rule of ALERT_RULES) expect(rule.description.endsWith("."), rule.key).toBe(true);
  });
});
