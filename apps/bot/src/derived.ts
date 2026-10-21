import { eq, schema, type Database } from "@onyc/db";
import { formatCompact } from "@onyc/format";
import type { Client } from "@onyc/sdk";
import type { Logger } from "pino";

const record = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const short = (a: string): string => `${a.slice(0, 4)}…${a.slice(-4)}`;

async function emit(
  db: Database,
  e: {
    ts: Date;
    kind: string;
    severity: string;
    title: string;
    body?: string;
    data: unknown;
    dedupKey: string;
  },
): Promise<boolean> {
  const rows = await db
    .insert(schema.events)
    .values({
      ts: e.ts,
      kind: e.kind,
      severity: e.severity,
      title: e.title,
      body: e.body ?? "",
      data: e.data,
      dedupKey: e.dedupKey,
    })
    .onConflictDoNothing({ target: schema.events.dedupKey })
    .returning({ id: schema.events.id });
  return rows.length > 0;
}

/**
 * Two rule kinds have no worker event: a wallet's rank and a large redemption. The bot derives them from the public API the same
 * way any developer could, and writes them as ordinary `events` so delivery treats every rule alike.
 */
export async function deriveWalletRankEvents(
  db: Database,
  client: Pick<Client, "call">,
  now: Date,
  log: Logger,
): Promise<number> {
  const rules = (
    await db.select().from(schema.alertRules).where(eq(schema.alertRules.enabled, true))
  ).filter((r) => r.kind === "wallet");
  const addresses = [
    ...new Set(
      rules
        .map((r) =>
          typeof record(r.params)["address"] === "string"
            ? (record(r.params)["address"] as string)
            : "",
        )
        .filter((a) => a !== ""),
    ),
  ];
  let emitted = 0;
  for (const address of addresses) {
    let rank: number | null;
    try {
      rank = (await client.call("wallet", { params: { address } })).data.rank;
    } catch (e) {
      log.warn(
        { address: short(address), error: e instanceof Error ? e.message : String(e) },
        "wallet lookup failed",
      );
      continue;
    }
    if (rank === null) continue;
    const mine = rules.filter((r) => record(r.params)["address"] === address);
    const previous = mine
      .map((r) => record(r.params)["lastRank"])
      .find((v): v is number => typeof v === "number");
    if (previous !== undefined && previous !== rank) {
      const fresh = await emit(db, {
        ts: now,
        kind: "wallet_rank",
        severity: "info",
        title: `Wallet ${short(address)} moved from #${previous} to #${rank}`,
        data: { address, from: previous, to: rank },
        dedupKey: `wallet_rank:${address}:${previous}>${rank}:${now.toISOString().slice(0, 13)}`,
      });
      if (fresh) emitted += 1;
    }
    for (const rule of mine) {
      if (record(rule.params)["lastRank"] !== rank) {
        await db
          .update(schema.alertRules)
          .set({ params: { ...record(rule.params), lastRank: rank } })
          .where(eq(schema.alertRules.id, rule.id));
      }
    }
  }
  return emitted;
}

export async function deriveLargeRedemptionEvents(
  db: Database,
  client: Pick<Client, "call">,
  log: Logger,
): Promise<number> {
  const rules = (
    await db.select().from(schema.alertRules).where(eq(schema.alertRules.enabled, true))
  ).filter((r) => r.kind === "redemption");
  if (rules.length === 0) return 0;
  const min = Math.min(...rules.map((r) => Number(record(r.params)["amount"] ?? Infinity)));
  const since = Math.min(...rules.map((r) => r.createdAt.getTime()));
  let rows;
  try {
    rows = (await client.call("redemptions")).data.log.rows;
  } catch (e) {
    log.warn({ error: e instanceof Error ? e.message : String(e) }, "redemption log lookup failed");
    return 0;
  }
  let emitted = 0;
  for (const row of rows) {
    if (row.amount < min || row.requestedAt === null) continue;
    const ts = new Date(row.requestedAt);
    if (ts.getTime() < since) continue; // history from before anyone subscribed is not news
    const fresh = await emit(db, {
      ts,
      kind: "large_redemption",
      severity: "info",
      title: `Redemption request of ${formatCompact(row.amount)} ONyc`,
      body: `Status ${row.status.toLowerCase()}. Wallet ${short(row.redeemer)}.`,
      data: {
        amount: row.amount,
        requestPda: row.requestPda,
        redeemer: row.redeemer,
        status: row.status,
      },
      dedupKey: `large_redemption:${row.requestPda}`,
    });
    if (fresh) emitted += 1;
  }
  return emitted;
}
