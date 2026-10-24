import { and, desc, eq, schema } from "@onyc/db";
import { formatUsdCompact } from "@onyc/format";
import {
  CONSTANTS,
  KNOWN_PROGRAMS,
  SolanaRpc,
  TOKEN_PROGRAM,
  byProtocol,
  concentration,
  decodeExcludedAccounts,
  decodeMarketStats,
  decodeOffer,
  decodeRedemptionOffer,
  decodeRedemptionRequest,
  decodeState,
  decodeTokenAccount,
  discriminatorFilter,
  findProgramAddress,
  labelHolders,
  scanMintHoldings,
  totalsByOwner,
  whaleMoves,
  classify,
  type ChainEventKind,
  type ClassifiedTx,
  type VenueMap,
  type ParsedTransaction,
  type Venue,
} from "@onyc/sources";
import type { Ctx, Job } from "../context.js";
import { emitEvent } from "../events.js";
import {
  advanceCursors,
  collectSignatures,
  planBatch,
  type Cursors,
  type Lane,
  type LaneSig,
} from "./cursor.js";
import { recordFailure, recordSuccess } from "../health.js";

const SOURCE_ID = "solana-rpc";
const P = CONSTANTS.onreProgram;
const ONYC = CONSTANTS.onycMint;
const DECIMALS = 1e9;

const rpcs = new WeakMap<object, Map<string, SolanaRpc>>();

/**
 * One RPC client per lane. A client sends one request at a time, so a long scan (every token account of the mint) would hold up
 * the live activity feed if both shared one; each lane has its own queue. On the public endpoint the pace stays under its
 * per-method limit (about one request a second), because a refused request costs far more time than a slow one.
 */
export function chainRpc(ctx: Ctx, lane: "activity" | "scan" = "scan"): SolanaRpc {
  const lanes = rpcs.get(ctx.config) ?? new Map<string, SolanaRpc>();
  rpcs.set(ctx.config, lanes);
  const hit = lanes.get(lane);
  if (hit !== undefined) return hit;
  const ownEndpoint =
    ctx.config.HELIUS_API_KEY !== undefined || ctx.config.SOLANA_RPC_URL !== undefined;
  const rpc = new SolanaRpc({
    heliusKey: ctx.config.HELIUS_API_KEY,
    url: ctx.config.SOLANA_RPC_URL,
    ...(ownEndpoint ? {} : { minIntervalMs: lane === "activity" ? 1_100 : 1_500 }),
  });
  lanes.set(lane, rpc);
  return rpc;
}

async function timed<T>(ctx: Ctx, endpoint: string, run: () => Promise<T>): Promise<T | null> {
  const started = Date.now();
  try {
    const out = await run();
    await recordSuccess(ctx, SOURCE_ID, endpoint, Date.now() - started);
    return out;
  } catch (error) {
    await recordFailure(ctx, SOURCE_ID, endpoint, error);
    return null;
  }
}

async function snapshot(ctx: Ctx, kind: string, data: unknown, slot?: number): Promise<void> {
  await ctx.handle.db
    .insert(schema.chainSnapshots)
    .values({ kind, ts: ctx.now(), slot: slot ?? null, data })
    .returning({ id: schema.chainSnapshots.id });
}

async function latestSnapshot(ctx: Ctx, kind: string): Promise<{ ts: Date; data: unknown } | null> {
  const t = schema.chainSnapshots;
  const row = (
    await ctx.handle.db.select().from(t).where(eq(t.kind, kind)).orderBy(desc(t.ts)).limit(1)
  )[0];
  return row === undefined ? null : { ts: row.ts, data: row.data };
}

// -------------------------------------------------------------------------------------------------
// Activity
// -------------------------------------------------------------------------------------------------
const venueCache = new Map<string, Venue | null>();

/** Holders of the latest hourly scan that were labelled with a protocol, by owner address. */
async function holderVenues(ctx: Ctx): Promise<VenueMap> {
  const t = schema.chainHolders;
  const last = (
    await ctx.handle.db.select({ scanTs: t.scanTs }).from(t).orderBy(desc(t.scanTs)).limit(1)
  )[0];
  if (last === undefined) return new Map();
  const rows = await ctx.handle.db.select().from(t).where(eq(t.scanTs, last.scanTs));
  const kinds = new Map(Object.values(KNOWN_PROGRAMS).map((v) => [v.label, v.kind]));
  const out = new Map<string, Venue>();
  for (const r of rows) {
    if (r.protocol === null || r.label === null || r.protocol === "OnRe") continue;
    out.set(r.owner, {
      label: r.label,
      protocol: r.protocol,
      kind: kinds.get(r.label) ?? "lending",
    });
  }
  return out;
}

/**
 * The protocols behind the owners of ONyc token accounts in one transaction. An owner is a protocol account when the account
 * itself belongs to a known program (see labels.ts); the answer is remembered, so each address is read from the chain once.
 */
export async function resolveVenues(
  rpc: SolanaRpc,
  tx: ParsedTransaction,
  minOnyc: number,
  labelled: VenueMap = new Map(),
): Promise<VenueMap> {
  const found = new Map<string, Venue>();
  const pre = new Map<number, bigint>();
  for (const b of tx.preTokenBalances)
    if (b.mint === ONYC) pre.set(b.accountIndex, BigInt(b.uiTokenAmount.amount));
  const owners = new Set<string>();
  for (const b of tx.postTokenBalances) {
    if (b.mint !== ONYC || b.owner === undefined) continue;
    const d = BigInt(b.uiTokenAmount.amount) - (pre.get(b.accountIndex) ?? 0n);
    if (Math.abs(Number(d)) / DECIMALS >= minOnyc) owners.add(b.owner);
  }
  for (const b of tx.preTokenBalances) {
    if (b.mint !== ONYC || b.owner === undefined) continue;
    if (Number(b.uiTokenAmount.amount) / DECIMALS >= minOnyc) owners.add(b.owner);
  }
  for (const owner of owners) {
    const known = labelled.get(owner);
    if (known !== undefined) {
      found.set(owner, known);
      continue;
    }
    let v = venueCache.get(owner);
    if (v === undefined) {
      try {
        const acc = await rpc.getAccount(owner);
        const hit = acc === null ? null : (KNOWN_PROGRAMS[acc.owner] ?? null);
        v = hit !== null && hit.kind === "onre" ? null : hit;
        venueCache.set(owner, v);
      } catch {
        continue; // not remembered, so the next transaction asks again
      }
    }
    if (v !== null) found.set(owner, v);
  }
  return found;
}

const NOTIFY: Partial<
  Record<
    ChainEventKind,
    { severity: "info" | "watch" | "alert"; title: (c: ClassifiedTx) => string }
  >
> = {
  redeem_request: {
    severity: "info",
    title: (c) => `Redemption requested on chain (${fmt(c.largestMove)} ONyc)`,
  },
  redeem_fulfilled: {
    severity: "info",
    title: (c) => `Redemption fulfilled on chain (${fmt(c.largestMove)} ONyc)`,
  },
  propamm_sell: {
    severity: "info",
    title: (c) => `ONyc sold to OnRe through PropAMM (${fmt(c.largestMove)} ONyc)`,
  },
  price_vector: {
    severity: "watch",
    title: (c) => `Price vector changed on chain (${c.instruction ?? "offer"})`,
  },
  admin_config: {
    severity: "watch",
    title: (c) => `OnRe program configuration changed (${c.instruction ?? "admin"})`,
  },
  large_transfer: {
    severity: "info",
    title: (c) => `Large ONyc transfer: ${fmt(c.largestMove)} ONyc`,
  },
};

const fmt = (n: number): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

/** Transactions read per run; the rest of a backlog waits for the next minute. */
const BATCH_MAX = 40;

/** Classify one transaction and store it; returns true when a new row was written. */
async function ingestTransaction(
  ctx: Ctx,
  rpc: SolanaRpc,
  signature: string,
  fallbackTime: number | null,
  tx: ParsedTransaction,
  labelled: VenueMap,
): Promise<boolean> {
  const venues = await resolveVenues(rpc, tx, ctx.config.CHAIN_VENUE_MOVE_ONYC, labelled);
  const c = classify(
    tx,
    ctx.config.CHAIN_TRANSFER_MIN_ONYC,
    venues,
    ctx.config.CHAIN_VENUE_MOVE_ONYC,
  );
  if (c === null) return false;
  const ts = new Date(
    (tx.blockTime ?? fallbackTime ?? Math.floor(ctx.now().getTime() / 1000)) * 1000,
  );
  const rows = await ctx.handle.db
    .insert(schema.chainEvents)
    .values({
      signature,
      kind: c.kind,
      instruction: c.instruction,
      ts,
      slot: tx.slot,
      signer: tx.signer,
      onycSupplyDelta: c.supplyDelta,
      onycLargestMove: c.largestMove,
      data: {
        instructions: c.instructions,
        ...(c.venue === null ? {} : { venue: c.venue.label, venueKind: c.venue.kind }),
      },
      seenAt: ctx.now(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.chainEvents.id });
  if (rows.length === 0) return false;
  // A move now recognised as one into a protocol replaces the plain large transfer stored for it earlier.
  if (c.venue !== null)
    await ctx.handle.db
      .delete(schema.chainEvents)
      .where(
        and(
          eq(schema.chainEvents.signature, signature),
          eq(schema.chainEvents.kind, "large_transfer"),
        ),
      );
  const notify = NOTIFY[c.kind];
  if (
    notify !== undefined &&
    Date.now() - ts.getTime() < 6 * 3_600_000 &&
    (c.kind !== "large_transfer" || c.largestMove >= ctx.config.CHAIN_LARGE_TRANSFER_ONYC)
  ) {
    await emitEvent(ctx, {
      kind: `chain_${c.kind}`,
      severity: notify.severity,
      title: notify.title(c),
      body: `Transaction ${signature}`,
      data: { signature, onyc: c.largestMove, instruction: c.instruction },
      dedupKey: `chain:${signature}:${c.kind}`,
      ts,
    });
  }
  return true;
}

/** Every minute: new transactions of the OnRe program and of the ONyc mint, classified and stored. */
export const chainActivityJob: Job = {
  name: "chain-activity",
  schedule: "15 * * * * *",
  startDelayMs: 8_000,
  async run(ctx) {
    const rpc = chainRpc(ctx, "activity");
    const cursorRow = await latestSnapshot(ctx, "cursor-v3");
    const saved = (cursorRow?.data ?? {}) as Cursors & { retries?: number };
    const cursors: Cursors = {
      ...(saved.program === undefined ? {} : { program: saved.program }),
      ...(saved.mint === undefined ? {} : { mint: saved.mint }),
    };
    const first = cursors.program === undefined;

    // Everything newer than each lane's cursor, page by page. A lane that could not be read keeps its cursor and is tried again.
    const lists: Partial<Record<Lane, LaneSig[]>> = {};
    for (const [lane, address] of [
      ["program", P],
      ["mint", ONYC],
    ] as const) {
      const found = await timed(ctx, `getSignaturesForAddress(${lane})`, () =>
        first
          ? rpc.getSignatures(address, { limit: 40 }).then((sigs) => ({ sigs, truncated: false }))
          : collectSignatures((o) => rpc.getSignatures(address, o), cursors[lane]),
      );
      if (found === null) continue;
      lists[lane] = found.sigs;
      if (found.truncated)
        ctx.log.warn(
          { lane },
          "more new signatures than one run reads; the oldest are left behind",
        );
    }
    if (lists.program === undefined && lists.mint === undefined) return;

    const plan = planBatch(lists, BATCH_MAX);
    const labelled = plan.some((e) => !e.skip) ? await holderVenues(ctx) : new Map<string, Venue>();
    let retries = saved.retries ?? 0;
    let stored = 0;
    let handled = 0;
    for (const entry of plan) {
      if (!entry.skip) {
        const tx = await timed(ctx, "getTransaction", () => rpc.getTransaction(entry.signature));
        if (tx === null) {
          // The cursor stays in front of a transaction that could not be fetched, so nothing after it is skipped. After five
          // tries it is given up.
          if (retries < 5) {
            retries += 1;
            break;
          }
        } else if (
          await ingestTransaction(ctx, rpc, entry.signature, entry.blockTime, tx, labelled)
        )
          stored += 1;
      }
      retries = 0;
      handled += 1;
    }
    await snapshot(ctx, "cursor-v3", {
      ...advanceCursors(cursors, plan.slice(0, handled)),
      retries,
    });
    ctx.log.info(
      { planned: plan.length, handled, stored, waiting: plan.length - handled },
      "chain activity",
    );
  },
};

// -------------------------------------------------------------------------------------------------
// State: supply, market stats, offers, redemptions, custody
// -------------------------------------------------------------------------------------------------

const SEEDS = {
  offerVault: "offer_vault_authority",
  redemptionVault: "redemption_offer_vault_authority",
  reserveVault: "reserve_vault_authority",
} as const;

/** Every 5 minutes: what the program says about itself, as plain JSON snapshots. */
export const chainStateJob: Job = {
  name: "chain-state",
  schedule: "20 1-59/5 * * * *",
  startDelayMs: 12_000,
  async run(ctx) {
    const rpc = chainRpc(ctx);
    const out = await timed(ctx, "program state", async () => {
      const supply = await rpc.getTokenSupply(ONYC);
      const [stateAcc] = await rpc.getProgramAccounts(P, [
        { memcmp: discriminatorFilter("State") },
      ]);
      const [statsAcc] = await rpc.getProgramAccounts(P, [
        { memcmp: discriminatorFilter("MarketStats") },
      ]);
      const offers = await rpc.getProgramAccounts(P, [
        { dataSize: 608 },
        { memcmp: discriminatorFilter("Offer") },
      ]);
      const redOffers = await rpc.getProgramAccounts(P, [
        { dataSize: 256 },
        { memcmp: discriminatorFilter("RedemptionOffer") },
      ]);
      const requests = await rpc.getProgramAccounts(P, [
        { memcmp: discriminatorFilter("RedemptionRequest") },
      ]);
      const [exclAcc] = await rpc.getProgramAccounts(P, [
        { memcmp: discriminatorFilter("CirculatingSupplyExcludedAccounts") },
      ]);
      if (stateAcc === undefined || statsAcc === undefined)
        throw new Error("program accounts not found");
      const state = decodeState(stateAcc.data);
      const stats = decodeMarketStats(statsAcc.data);
      const excluded = exclAcc === undefined ? [] : decodeExcludedAccounts(exclAcc.data).owners;

      // Custody visible on chain: token accounts owned by the program's vault authorities and by the boss.
      const authorities = {
        "Offer vault": findProgramAddress([SEEDS.offerVault], P).address,
        "Redemption vault": findProgramAddress([SEEDS.redemptionVault], P).address,
        "Reserve vault": findProgramAddress([SEEDS.reserveVault], P).address,
        Boss: state.boss,
      };
      const custody: { holder: string; owner: string; mint: string; amount: number }[] = [];
      for (const [holder, owner] of Object.entries(authorities)) {
        const accounts = await rpc.getProgramAccounts(TOKEN_PROGRAM, [
          { dataSize: 165 },
          { memcmp: { offset: 32, bytes: owner } },
        ]);
        for (const a of accounts) {
          const t = decodeTokenAccount(a.data);
          if (t.amount > 0n)
            custody.push({ holder, owner, mint: t.mint, amount: Number(t.amount) });
        }
      }
      return { supply, state, stats, offers, redOffers, requests, excluded, custody, authorities };
    });
    if (out === null) return;
    const { supply, state, stats, offers, redOffers, requests, excluded, custody, authorities } =
      out;
    const now = ctx.now();

    const nav = Number(stats.nav) / 1e9;
    const supplyOnyc = Number(supply.amount) / DECIMALS;
    const circulating = Number(stats.circulatingSupply) / DECIMALS;
    await snapshot(ctx, "supply", {
      totalSupply: supplyOnyc,
      circulatingSupply: circulating,
      excludedHeld: supplyOnyc - circulating,
      excludedOwners: excluded,
      impliedAumUsd: supplyOnyc * nav,
      impliedCirculatingUsd: circulating * nav,
    });
    await snapshot(ctx, "market_stats", {
      nav,
      apy: Number(stats.apy) / 1e6,
      tvlUsd: Number(stats.tvl) / 1e9,
      circulatingSupply: circulating,
      updatedAt: new Date(Number(stats.lastUpdatedAt) * 1000).toISOString(),
      updatedSlot: Number(stats.lastUpdatedSlot),
    });
    await snapshot(ctx, "program_state", {
      boss: state.boss,
      isKilled: state.isKilled,
      admins: state.admins,
      worker: state.worker,
      mainOffer: state.mainOffer,
      maxSupply: Number(state.maxSupply) / DECIMALS,
      offers: offers.map((o) => {
        const d = decodeOffer(o.data);
        return {
          address: o.pubkey,
          tokenIn: d.tokenInMint,
          disabled: d.disabled,
          feeBps: d.feeBasisPoints,
          vectors: d.vectors.map((v) => ({
            startTime: Number(v.startTime),
            baseTime: Number(v.baseTime),
            basePrice: Number(v.basePrice),
            apr: Number(v.apr),
            priceFixDuration: Number(v.priceFixDuration),
          })),
        };
      }),
    });
    const open = requests
      .map((r) => decodeRedemptionRequest(r.data))
      .filter((r) => r.fulfilledAmount < r.amount);
    await snapshot(ctx, "redemptions", {
      offers: redOffers.map((o) => {
        const d = decodeRedemptionOffer(o.data);
        return {
          address: o.pubkey,
          tokenOut: d.tokenOutMint,
          executed: Number(d.executedRedemptions) / DECIMALS,
          requested: Number(d.requestedRedemptions) / DECIMALS,
          feeBps: d.feeBasisPoints,
          propAmmFeeBps: d.feeBasisPointsPropAmmSell,
          vaultTargetBps: d.vaultTargetBps,
          disabled: d.disabled,
        };
      }),
      openRequests: open.map((r) => ({
        offer: r.offer,
        redeemer: r.redeemer,
        amount: Number(r.amount) / DECIMALS,
        fulfilled: Number(r.fulfilledAmount) / DECIMALS,
      })),
      requestAccounts: requests.length,
    });
    await snapshot(ctx, "vault_balances", { authorities, balances: custody });

    // Check 1: the AUM the API reports is circulating supply times NAV (the live TVL is built that way), so it must
    // agree with the chain. A gap means one of the two feeds is wrong or late.
    const api = await latestApiAum(ctx);
    const impliedCirculating = circulating * nav;
    if (api !== null) {
      const gap = (api - impliedCirculating) / impliedCirculating;
      if (Math.abs(gap) >= ctx.config.CHAIN_AUM_GAP_ALERT) {
        await emitEvent(ctx, {
          kind: "chain_aum_gap",
          severity: "watch",
          title: `AUM reported by the API differs from on-chain circulating supply times NAV by ${(gap * 100).toFixed(1)}%`,
          body: `API ${formatUsdCompact(api)} against ${formatUsdCompact(impliedCirculating)} (circulating supply ${fmt(circulating)} ONyc at NAV ${nav.toFixed(6)}). Threshold ${(ctx.config.CHAIN_AUM_GAP_ALERT * 100).toFixed(1)}%.`,
          data: { api, implied: impliedCirculating, gap },
          dedupKey: `chain_aum_gap:${now.toISOString().slice(0, 13)}`,
        });
      }
    }

    // Check 2, the independent one: reserves that Accountable attests against what all holders are owed at NAV.
    const solv = (
      await ctx.handle.db
        .select()
        .from(schema.solvencySnap)
        .orderBy(desc(schema.solvencySnap.ts))
        .limit(1)
    )[0];
    if (solv?.reservesUsd != null) {
      const owed = supplyOnyc * nav;
      const gap = (solv.reservesUsd - owed) / owed;
      if (gap <= -ctx.config.CHAIN_AUM_GAP_ALERT) {
        await emitEvent(ctx, {
          kind: "chain_reserves_gap",
          severity: "alert",
          title: `Reserves reported by Accountable are ${(Math.abs(gap) * 100).toFixed(1)}% below what on-chain supply is worth at NAV`,
          body: `Reserves ${formatUsdCompact(solv.reservesUsd)} against ${formatUsdCompact(owed)} (total supply ${fmt(supplyOnyc)} ONyc at NAV ${nav.toFixed(6)}). The attestation was retrieved ${solv.retrievedAt.toISOString()}. Threshold ${(ctx.config.CHAIN_AUM_GAP_ALERT * 100).toFixed(1)}%.`,
          data: { reserves: solv.reservesUsd, owed, gap },
          dedupKey: `chain_reserves_gap:${now.toISOString().slice(0, 13)}`,
        });
      }
    }
  },
};

async function latestApiAum(ctx: Ctx): Promise<number | null> {
  const t = schema.liveTicks;
  const row = (await ctx.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0];
  return row?.tvl ?? null;
}

// -------------------------------------------------------------------------------------------------
// Holders
// -------------------------------------------------------------------------------------------------

/** Hourly: every token account of the mint, summed by owner, the top 300 labelled. */
export const chainHoldersJob: Job = {
  name: "chain-holders",
  schedule: "40 7 * * * *",
  startDelayMs: 20_000,
  async run(ctx) {
    const rpc = chainRpc(ctx);
    const scanTs = ctx.now();
    const scanned = await timed(ctx, "getProgramAccounts(token, mint)", async () => {
      const holdings = await scanMintHoldings(rpc, ONYC);
      const totals = totalsByOwner(holdings);
      const state = await latestSnapshot(ctx, "program_state");
      const boss = (state?.data as { boss?: string } | undefined)?.boss;
      const extra: Record<string, Venue> = {};
      if (boss !== undefined)
        extra[boss] = { label: "OnRe boss wallet", protocol: "OnRe", kind: "onre" };
      for (const [seed, label] of [
        [SEEDS.offerVault, "OnRe offer vault"],
        [SEEDS.redemptionVault, "OnRe redemption vault"],
        [SEEDS.reserveVault, "OnRe reserve vault"],
      ] as const) {
        extra[findProgramAddress([seed], P).address] = { label, protocol: "OnRe", kind: "onre" };
      }
      const labelled = await labelHolders(rpc, totals.slice(0, 300), {
        extra,
        holdings,
        inferTop: 40,
      });
      return { holdings, totals, labelled };
    });
    if (scanned === null) return;
    const { totals, labelled } = scanned;

    await ctx.handle.db.insert(schema.chainHolders).values(
      labelled.map((h, i) => ({
        scanTs,
        rank: i + 1,
        owner: h.owner,
        amount: Number(h.amount) / DECIMALS,
        tokenAccounts: h.accounts,
        kind: h.kind,
        protocol: h.venue?.protocol ?? null,
        label: h.venue?.label ?? null,
        labelledBy: h.labelledBy,
      })),
    );
    const c = concentration(totals);
    await snapshot(ctx, "holder_stats", {
      holders: c.holders,
      gini: c.gini,
      top: c.top,
      byProtocol: byProtocol(labelled),
      labelledShare:
        labelled
          .filter((h) => h.venue !== null || h.kind === "wallet")
          .reduce((a, h) => a + Number(h.amount), 0) /
        Math.max(
          1,
          labelled.reduce((a, h) => a + Number(h.amount), 0),
        ),
    });

    // New and exited whales against the previous scan.
    const t = schema.chainHolders;
    const prev = (
      await ctx.handle.db
        .select({ scanTs: t.scanTs })
        .from(t)
        .where(
          // the scan before this one
          eq(t.rank, 1),
        )
        .orderBy(desc(t.scanTs))
        .limit(2)
    )[1];
    if (prev !== undefined) {
      const before = (await ctx.handle.db.select().from(t).where(eq(t.scanTs, prev.scanTs))).map(
        (r) => ({
          owner: r.owner,
          amount: BigInt(Math.round(r.amount * DECIMALS)),
          accounts: r.tokenAccounts,
        }),
      );
      for (const m of whaleMoves(
        before,
        totals.slice(0, 300),
        BigInt(ctx.config.CHAIN_LARGE_TRANSFER_ONYC) * 1_000_000_000n,
      )) {
        const venue = labelled.find((h) => h.owner === m.owner)?.venue;
        await emitEvent(ctx, {
          kind: m.kind === "new" ? "whale_new" : "whale_exit",
          severity: "info",
          title: `${m.kind === "new" ? "New" : "Exited"} large ONyc holder ${m.owner.slice(0, 4)}…${m.owner.slice(-4)}${venue ? ` (${venue.label})` : ""}`,
          body: `Balance ${fmt(Number(m.before) / DECIMALS)} to ${fmt(Number(m.after) / DECIMALS)} ONyc between two hourly scans.`,
          data: {
            owner: m.owner,
            before: Number(m.before) / DECIMALS,
            after: Number(m.after) / DECIMALS,
          },
          dedupKey: `whale:${m.kind}:${m.owner}:${scanTs.toISOString().slice(0, 13)}`,
        });
      }
    }
  },
};
