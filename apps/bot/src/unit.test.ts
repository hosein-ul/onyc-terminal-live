import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { helpText, parseCommand, parseRuleArgs } from "./commands.js";
import { loadConfig } from "./config.js";
import { formatAlert } from "./format.js";
import { describeRule, matches } from "./rules.js";
import { TelegramClient } from "./telegram.js";
import { checkWebhookUrl, isPrivateAddress, postWebhook } from "./webhook.js";

const WALLET = "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh";

describe("parseCommand", () => {
  it("parses every rule from the example the Activity page shows", async () => {
    const { ALERT_RULES } = await import("@onyc/sdk");
    for (const rule of ALERT_RULES) {
      const parsed = parseCommand(rule.example);
      expect(parsed.kind, rule.key).toBe("subscribe");
      if (parsed.kind === "subscribe") expect(parsed.rule).toBe(rule.key);
    }
  });

  it("stores typed parameters", () => {
    expect(parseCommand("/subscribe discount 50")).toEqual({
      kind: "subscribe",
      rule: "discount",
      params: { bps: 50 },
    });
    expect(parseCommand("/subscribe apy Kamino 2.5")).toEqual({
      kind: "subscribe",
      rule: "apy",
      params: { protocol: "kamino", points: 2.5 },
    });
    expect(parseCommand(`/subscribe wallet ${WALLET}`)).toEqual({
      kind: "subscribe",
      rule: "wallet",
      params: { address: WALLET },
    });
    expect(parseCommand("/subscribe redemption 1000000")).toEqual({
      kind: "subscribe",
      rule: "redemption",
      params: { amount: 1_000_000 },
    });
  });

  it("accepts the @botname suffix Telegram adds in groups", () => {
    expect(parseCommand("/subscribe@onyc_bot downtick").kind).toBe("subscribe");
    expect(parseCommand("/LIST").kind).toBe("list");
  });

  it("says what is wrong instead of guessing", () => {
    for (const bad of [
      "/subscribe",
      "/subscribe nope",
      "/subscribe discount",
      "/subscribe discount -5",
      "/subscribe discount abc",
      "/subscribe discount 0",
      "/subscribe discount 99999",
      "/subscribe wallet 0OIl",
      "/subscribe apy kamino",
      "/subscribe downtick extra",
      "hello",
    ]) {
      const parsed = parseCommand(bad);
      expect(parsed.kind, bad).toBe("invalid");
      if (parsed.kind === "invalid") expect(parsed.message.length, bad).toBeGreaterThan(10);
    }
  });

  it("parses unsubscribe and webhook", () => {
    expect(parseCommand("/unsubscribe 2")).toEqual({ kind: "unsubscribe", target: 2 });
    expect(parseCommand("/unsubscribe all")).toEqual({ kind: "unsubscribe", target: "all" });
    expect(parseCommand("/unsubscribe 0").kind).toBe("invalid");
    expect(parseCommand("/webhook https://example.com/hook discount 25")).toEqual({
      kind: "webhook",
      url: "https://example.com/hook",
      rule: "discount",
      params: { bps: 25 },
    });
    expect(parseCommand("/webhook https://example.com/hook").kind).toBe("invalid");
  });

  it("lists every rule in the help text", () => {
    const help = helpText();
    for (const key of ["discount", "downtick", "layer", "apy", "solvency", "wallet", "redemption"])
      expect(help).toContain(`/subscribe ${key}`);
    expect(help).toContain("not affiliated");
  });

  it("validates rule arguments on their own", () => {
    expect(parseRuleArgs("discount", ["50"])).toEqual({ ok: true, params: { bps: 50 } });
    expect(parseRuleArgs("downtick", [])).toEqual({ ok: true, params: {} });
    expect(parseRuleArgs("downtick", ["x"]).ok).toBe(false);
  });
});

describe("matches", () => {
  const discount = { kind: "discount", params: { bps: 50 } };
  it("fires a discount rule only when the breach is at least as deep as asked", () => {
    expect(matches(discount, { kind: "discount_breach", data: { premiumBps: -80 } })).toBe(true);
    expect(matches(discount, { kind: "discount_breach", data: { premiumBps: -50 } })).toBe(true);
    expect(matches(discount, { kind: "discount_breach", data: { premiumBps: -30 } })).toBe(false);
    expect(matches(discount, { kind: "premium_breach", data: { premiumBps: 80 } })).toBe(false);
    expect(matches(discount, { kind: "discount_breach", data: null })).toBe(false);
  });

  it("matches layer events by prefix and ignores unrelated kinds", () => {
    expect(matches({ kind: "layer", params: {} }, { kind: "layer_new", data: {} })).toBe(true);
    expect(matches({ kind: "layer", params: {} }, { kind: "layer_status_change", data: {} })).toBe(
      true,
    );
    expect(matches({ kind: "layer", params: {} }, { kind: "nav_downtick", data: {} })).toBe(false);
  });

  it("matches APY changes by protocol and size, in percentage points", () => {
    const rule = { kind: "apy", params: { protocol: "kamino", points: 2 } };
    expect(
      matches(rule, {
        kind: "opportunity_apy_change",
        data: { key: "kamino.usdc", from: 0.05, to: 0.08 },
      }),
    ).toBe(true);
    expect(
      matches(rule, {
        kind: "opportunity_apy_change",
        data: { key: "kamino.usdc", from: 0.05, to: 0.06 },
      }),
    ).toBe(false);
    expect(
      matches(rule, {
        kind: "opportunity_apy_change",
        data: { key: "loopscale.usdc", from: 0.05, to: 0.2 },
      }),
    ).toBe(false);
    expect(
      matches(rule, {
        kind: "opportunity_apy_change",
        data: { key: "kamino", from: null, to: 0.05 },
      }),
    ).toBe(true);
  });

  it("matches wallet and redemption rules on their own data", () => {
    expect(
      matches(
        { kind: "wallet", params: { address: WALLET } },
        { kind: "wallet_rank", data: { address: WALLET } },
      ),
    ).toBe(true);
    expect(
      matches(
        { kind: "wallet", params: { address: WALLET } },
        { kind: "wallet_rank", data: { address: "other" } },
      ),
    ).toBe(false);
    expect(
      matches(
        { kind: "redemption", params: { amount: 1000 } },
        { kind: "large_redemption", data: { amount: 1000 } },
      ),
    ).toBe(true);
    expect(
      matches(
        { kind: "redemption", params: { amount: 1000 } },
        { kind: "large_redemption", data: { amount: 999 } },
      ),
    ).toBe(false);
  });

  it("never matches an unknown rule", () => {
    expect(matches({ kind: "nope", params: {} }, { kind: "nav_downtick", data: {} })).toBe(false);
  });

  it("describes rules in words", () => {
    expect(describeRule(discount)).toBe("discount of at least 50 bps");
    expect(describeRule({ kind: "downtick", params: {} })).toBe("NAV down-ticks");
  });
});

describe("formatAlert", () => {
  it("is plain text with the severity, the time and the disclaimer", () => {
    const text = formatAlert(
      {
        severity: "alert",
        title: "ONyc trades at a −80 bps discount to NAV",
        body: "Market 1.1485 vs NAV 1.1578.",
        ts: new Date("2026-10-21T15:28:00Z"),
      },
      "https://example.com/risk",
    );
    expect(text.split("\n")).toEqual([
      "[ALERT] ONyc trades at a −80 bps discount to NAV",
      "Market 1.1485 vs NAV 1.1578.",
      "2026-10-21 15:28 UTC",
      "https://example.com/risk",
      "Independent community tool, not affiliated with OnRe. Not investment advice.",
    ]);
    expect(text).not.toMatch(/[*_`<>]/);
  });
});

describe("webhook safety", () => {
  it("accepts a public https URL and refuses everything else", () => {
    expect(checkWebhookUrl("https://hooks.example.com/onyc").ok).toBe(true);
    for (const bad of [
      "http://example.com/x",
      "https://localhost/x",
      "https://127.0.0.1/x",
      "https://10.0.0.5/x",
      "https://192.168.1.1/x",
      "https://169.254.169.254/latest",
      "https://[::1]/x",
      "https://user:pw@example.com/x",
      "https://example.com:8443/x",
      "https://service.internal/x",
      "ftp://example.com",
      "not a url",
    ]) {
      expect(checkWebhookUrl(bad).ok, bad).toBe(false);
    }
  });

  it("recognises private and public addresses", () => {
    for (const a of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ])
      expect(isPrivateAddress(a), a).toBe(true);
    for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"])
      expect(isPrivateAddress(a), a).toBe(false);
  });

  it("refuses a host that resolves to a private address", async () => {
    await expect(
      postWebhook(
        "https://rebind.example.com/x",
        {},
        {
          resolve: () => Promise.resolve(["10.0.0.1"]),
          fetchImpl: () => Promise.reject(new Error("must not be called")),
        },
      ),
    ).rejects.toThrow(/private/);
  });

  it("posts signed JSON without following redirects", async () => {
    let seen: {
      url: string;
      headers: Record<string, string>;
      body: string;
      redirect: string | undefined;
    } | null = null;
    const fetchImpl: typeof fetch = (input, init) => {
      seen = {
        url: typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        headers: init?.headers as Record<string, string>,
        body: typeof init?.body === "string" ? init.body : "",
        redirect: init?.redirect,
      };
      return Promise.resolve(new Response("ok", { status: 200 }));
    };
    await postWebhook(
      "https://hooks.example.com/onyc",
      { a: 1 },
      { resolve: () => Promise.resolve(["93.184.216.34"]), fetchImpl, secret: "s3cret" },
    );
    expect(seen).not.toBeNull();
    const s = seen as unknown as {
      url: string;
      headers: Record<string, string>;
      body: string;
      redirect: string;
    };
    expect(s.redirect).toBe("manual");
    expect(s.headers["x-onyc-signature"]).toBe(
      `sha256=${createHmac("sha256", "s3cret").update(s.body).digest("hex")}`,
    );
  });

  it("fails on a non-2xx answer", async () => {
    await expect(
      postWebhook(
        "https://hooks.example.com/x",
        {},
        {
          resolve: () => Promise.resolve(["93.184.216.34"]),
          fetchImpl: () => Promise.resolve(new Response("no", { status: 500 })),
        },
      ),
    ).rejects.toThrow(/500/);
  });
});

describe("TelegramClient", () => {
  it("returns text messages, skips the rest and advances the offset past all of them", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            result: [
              { update_id: 10, message: { text: "/list", chat: { id: 42, type: "private" } } },
              { update_id: 11, message: { chat: { id: 42, type: "private" } } },
              { update_id: 12 },
            ],
          }),
        ),
      );
    const out = await new TelegramClient("T", fetchImpl).getUpdates(0, 1);
    expect(out.updates).toEqual([
      { updateId: 10, chatId: "42", chatType: "private", text: "/list" },
    ]);
    expect(out.nextOffset).toBe(13);
  });

  it("never puts the token in an error message", async () => {
    const fetchImpl: typeof fetch = () =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: false, description: "chat not found" }), { status: 400 }),
      );
    const error = await new TelegramClient("123:SECRET", fetchImpl)
      .sendMessage("1", "hi")
      .catch((e: unknown) => e);
    expect(String(error)).toContain("chat not found");
    expect(String(error)).not.toContain("SECRET");
  });
});

describe("loadConfig", () => {
  it("treats empty optional variables as not set", () => {
    const c = loadConfig({
      DATABASE_URL: "postgres://x",
      TELEGRAM_BOT_TOKEN: "",
      WEBHOOK_SECRET: "",
    });
    expect(c.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(c.WEBHOOK_SECRET).toBeUndefined();
    expect(c.API_PUBLIC_URL).toBe("http://localhost:4000");
  });
  it("needs a database", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
