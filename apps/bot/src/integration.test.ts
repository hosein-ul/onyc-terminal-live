/**
 * End to end over a real Postgres: a simulated peg breach goes through the worker's real evaluator, becomes an `events` row, and the
 * bot delivers it to the Telegram chats and webhooks whose rules it matches, once. Skipped unless DATABASE_URL is reachable.
 */
import { connect, migrationsFolder, runMigrations, schema, eq, type DbHandle } from "@onyc/db";
import { simulatePegBreach } from "@onyc/worker/testing";
import pino from "pino";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliverPending, type Sender } from "./deliver.js";
import { deriveLargeRedemptionEvents, deriveWalletRankEvents } from "./derived.js";
import { handleMessage } from "./handlers.js";

const baseUrl = process.env["DATABASE_URL"];
const log = pino({ level: "silent" });
const WALLET = "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh";

describe.skipIf(baseUrl === undefined)("alerts end to end", () => {
  let handle: DbHandle;
  let admin: postgres.Sql;
  let testUrl: string;

  const sent: { chatId: string; text: string }[] = [];
  const hooks: { url: string; payload: unknown }[] = [];
  const sender: Sender = {
    telegram: (chatId, text) => {
      sent.push({ chatId, text });
      return Promise.resolve();
    },
    webhook: (url, payload) => {
      hooks.push({ url, payload });
      return Promise.resolve();
    },
  };

  beforeAll(async () => {
    const adminUrl = new URL(baseUrl ?? "");
    adminUrl.pathname = "/postgres";
    const url = new URL(baseUrl ?? "");
    url.pathname = "/onyc_bot_test";
    testUrl = url.href;
    admin = postgres(adminUrl.href, { max: 1, onnotice: () => {} });
    await admin.unsafe("drop database if exists onyc_bot_test with (force)");
    await admin.unsafe(
      "create database onyc_bot_test encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0",
    );
    handle = connect(testUrl, { max: 4 });
    await runMigrations(handle.db, migrationsFolder);
  });

  afterAll(async () => {
    await handle.close();
    await admin.unsafe("drop database if exists onyc_bot_test with (force)");
    await admin.end();
  });

  it("subscribes, lists and unsubscribes through the same parser the Activity page documents", async () => {
    const db = handle.db;
    expect(await handleMessage(db, "chat-a", "/list")).toContain("no alert rules");
    expect(await handleMessage(db, "chat-a", "/subscribe discount 50")).toContain("Subscribed");
    expect(await handleMessage(db, "chat-a", "/subscribe discount 50")).toBe(
      "You already have that rule.",
    );
    expect(await handleMessage(db, "chat-a", "/subscribe downtick")).toContain("Subscribed");
    expect(await handleMessage(db, "chat-a", "/list")).toBe(
      "1. discount of at least 50 bps\n2. NAV down-ticks",
    );
    expect(await handleMessage(db, "chat-b", "/list")).toContain("no alert rules"); // rules are private to a chat
    expect(await handleMessage(db, "chat-a", "/unsubscribe 2")).toBe("Removed 1 rule.");
    expect(await handleMessage(db, "chat-a", "/unsubscribe 9")).toContain(
      "No rule has that number",
    );
    expect(await handleMessage(db, "chat-a", "/subscribe discount nope")).toContain("Usage");
    await handleMessage(db, "chat-a", "/unsubscribe all");
    expect(await handleMessage(db, "chat-a", "/list")).toContain("no alert rules");
  });

  it("refuses an unsafe webhook and stores a safe one against its owner", async () => {
    const db = handle.db;
    expect(await handleMessage(db, "chat-w", "/webhook http://example.com/x downtick")).toContain(
      "https",
    );
    expect(await handleMessage(db, "chat-w", "/webhook https://127.0.0.1/x downtick")).toContain(
      "private",
    );
    expect(
      await handleMessage(db, "chat-w", "/webhook https://hooks.example.com/onyc discount 40"),
    ).toContain("Subscribed");
    expect(await handleMessage(db, "chat-w", "/list")).toContain(
      "webhook https://hooks.example.com/onyc",
    );
    expect(await handleMessage(db, "chat-other", "/list")).toContain("no alert rules");
    await handleMessage(db, "chat-w", "/unsubscribe all");
  });

  it("fires a test alert end to end from a simulated discount breach, exactly once per rule", async () => {
    const db = handle.db;
    await handleMessage(db, "deep", "/subscribe discount 50"); // breach is 80 bps: fires
    await handleMessage(db, "shallow", "/subscribe discount 120"); // needs 120 bps: does not fire
    await handleMessage(db, "tick", "/subscribe downtick"); // a different kind of event: does not fire
    await handleMessage(db, "hook", "/webhook https://hooks.example.com/onyc discount 25");
    await new Promise((r) => setTimeout(r, 50));
    const now = new Date();

    await simulatePegBreach(handle, testUrl, now, -80);
    const events = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.kind, "discount_breach"));
    expect(events).toHaveLength(1);
    expect(events[0]?.severity).toBe("alert");

    const first = await deliverPending(db, sender, {
      now,
      log,
      webUrl: "https://terminal.example/risk",
    });
    expect(first).toEqual({ sent: 2, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.chatId).toBe("deep");
    expect(sent[0]?.text).toContain("[ALERT]");
    expect(sent[0]?.text).toContain("−80 bps");
    expect(sent[0]?.text).toContain("https://terminal.example/risk");
    expect(hooks).toHaveLength(1);
    expect(hooks[0]?.url).toBe("https://hooks.example.com/onyc");
    expect(JSON.stringify(hooks[0]?.payload)).toContain("discount_breach");

    // Delivering again sends nothing: the (rule, event) pair is recorded.
    expect(await deliverPending(db, sender, { now, log })).toEqual({
      sent: 0,
      failed: 0,
      skipped: 0,
    });
    expect(sent).toHaveLength(1);
    const rows = await db.select().from(schema.alertDeliveries);
    expect(rows.map((r) => r.status).sort()).toEqual(["sent", "sent"]);
  });

  it("does not send history to a rule that was created after the event", async () => {
    const db = handle.db;
    await handleMessage(db, "late", "/subscribe discount 10");
    const before = sent.length;
    const r = await deliverPending(db, sender, { now: new Date(), log });
    expect(r.sent).toBe(0);
    expect(sent).toHaveLength(before);
  });

  it("records a failed delivery without losing the others, and skips Telegram when it is not configured", async () => {
    const db = handle.db;
    await handleMessage(db, "flaky", "/subscribe downtick");
    await new Promise((r) => setTimeout(r, 20));
    await db.insert(schema.events).values({
      ts: new Date(),
      kind: "nav_downtick",
      severity: "alert",
      title: "NAV down-tick",
      body: "",
      data: null,
      dedupKey: "test:downtick",
    });
    const failing: Sender = {
      telegram: () => Promise.reject(new Error("chat not found")),
      webhook: sender.webhook,
    };
    const r1 = await deliverPending(db, failing, { now: new Date(), log });
    expect(r1.failed).toBe(2); // the "tick" and "flaky" chats
    const failed = (await db.select().from(schema.alertDeliveries)).filter(
      (d) => d.status === "failed",
    );
    expect(failed[0]?.error).toBe("chat not found");

    await db.insert(schema.events).values({
      ts: new Date(),
      kind: "nav_downtick",
      severity: "alert",
      title: "Second down-tick",
      body: "",
      data: null,
      dedupKey: "test:downtick2",
    });
    const r2 = await deliverPending(
      db,
      { telegram: null, webhook: sender.webhook },
      { now: new Date(), log },
    );
    expect(r2.skipped).toBe(2);
  });

  it("derives wallet rank and large redemption events from the API, once", async () => {
    const db = handle.db;
    await handleMessage(db, "w", `/subscribe wallet ${WALLET}`);
    await handleMessage(db, "r", "/subscribe redemption 100000");
    await new Promise((res) => setTimeout(res, 20));
    let rank = 5;
    const row = (pda: string, amount: number, requestedAt: string) => ({
      requestPda: pda,
      redeemer: WALLET,
      status: "EXECUTED",
      amount,
      fulfilledAmount: amount,
      requestedAt,
      redemptionTime: null,
      tokenOutMint: "m",
      submissionTx: null,
      fulfillmentTxs: [],
    });
    const fake = {
      call: (name: string) => {
        if (name === "wallet") return Promise.resolve({ data: { rank }, meta: {} });
        return Promise.resolve({
          data: {
            log: {
              rows: [
                row("old", 500_000, "2020-01-01T00:00:00Z"),
                row("small", 10, new Date().toISOString()),
                row("big", 250_000, new Date(Date.now() + 1000).toISOString()),
              ],
            },
          },
          meta: {},
        });
      },
    } as unknown as Parameters<typeof deriveWalletRankEvents>[1];

    const now = new Date();
    expect(await deriveWalletRankEvents(db, fake, now, log)).toBe(0); // first look only records the rank
    rank = 3;
    expect(await deriveWalletRankEvents(db, fake, now, log)).toBe(1);
    expect(await deriveWalletRankEvents(db, fake, now, log)).toBe(0); // same rank again: nothing new
    expect(await deriveLargeRedemptionEvents(db, fake, log)).toBe(1); // only the large, recent one
    expect(await deriveLargeRedemptionEvents(db, fake, log)).toBe(0);

    const r = await deliverPending(db, sender, { now: new Date(Date.now() + 5000), log });
    expect(r.sent).toBeGreaterThanOrEqual(2);
    expect(sent.some((s) => s.chatId === "w" && s.text.includes("moved from #5 to #3"))).toBe(true);
    expect(
      sent.some((s) => s.chatId === "r" && s.text.includes("Redemption request of 250.0K ONyc")),
    ).toBe(true);
  });
});
