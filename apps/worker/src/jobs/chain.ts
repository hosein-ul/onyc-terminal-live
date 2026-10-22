import { desc, eq, schema } from "@onyc/db";
import { formatUsdCompact } from "@onyc/format";
import {
  CONSTANTS,
  KIND_PRIORITY,
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
  identifyInstruction,
  labelHolders,
  scanMintHoldings,
  totalsByOwner,
  whaleMoves,
  type ChainEventKind,
  type ParsedTransaction,
  type Venue,
} from "@onyc/sources";
import type { Ctx, Job } from "../context.js";
import { emitEvent } from "../events.js";
import { recordFailure, recordSuccess } from "../health.js";

const SOURCE_ID = "solana-rpc";
const P = CONSTANTS.onreProgram;
const ONYC = CONSTANTS.onycMint;
const DECIMALS = 1e9;

const rpcs = new WeakMap<object, SolanaRpc>();

/** One client per worker, so the rate limit is shared by every chain job. */
export function chainRpc(ctx: Ctx): SolanaRpc {
  const hit = rpcs.get(ctx.config);
  if (hit !== undefined) return hit;
  const rpc = new SolanaRpc({
    heliusKey: ctx.config.HELIUS_API_KEY,
    url: ctx.config.SOLANA_RPC_URL,
  });
  rpcs.set(ctx.config, rpc);
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

export interface ClassifiedTx {
  kind: ChainEventKind;
  instruction: string | null;
  instructions: string[];
  /** Change in ONyc supply, whole tokens (mints positive, burns negative). */
  supplyDelta: number;
  /** Largest single ONyc balance change, whole tokens (absolute). */
  largestMove: number;
}

/** ONyc balance changes of one transaction: the sum is the supply change, the largest is the biggest mover. */
export function onycMoves(tx: ParsedTransaction): { supplyDelta: number; largestMove: number } {
  const pre = new Map<number, bigint>();
  for (const b of tx.preTokenBalances)
    if (b.mint === ONYC) pre.set(b.accountIndex, BigInt(b.uiTokenAmount.amount));
  const seen = new Set<number>();
  let sum = 0n;
  let largest = 0n;
  for (const b of tx.postTokenBalances) {
    if (b.mint !== ONYC) continue;
    seen.add(b.accountIndex);
    const d = BigInt(b.uiTokenAmount.amount) - (pre.get(b.accountIndex) ?? 0n);
    sum += d;
    const abs = d < 0n ? -d : d;
    if (abs > largest) largest = abs;
  }
  for (const [i, v] of pre) {
    if (seen.has(i)) continue;
    sum -= v;
    if (v > largest) largest = v;
  }
  return { supplyDelta: Number(sum) / DECIMALS, largestMove: Number(largest) / DECIMALS };
}

/**
 * What a transaction was. Program instructions win; a transaction that only moves ONyc between wallets is a large transfer
 * when the biggest single move reaches `largeTransfer`.
 */
export function classify(tx: ParsedTransaction, largeTransfer: number): ClassifiedTx | null {
  const names: { name: string; kind: ChainEventKind }[] = [];
  for (const ins of tx.instructions) {
    if (ins.programId !== P) continue;
    const id = identifyInstruction(ins.discriminator);
    if (id !== null) names.push(id);
  }
  const { supplyDelta, largestMove } = onycMoves(tx);
  if (names.length > 0) {
    const primary = KIND_PRIORITY.find((k) => names.some((n) => n.kind === k)) ?? names[0]?.kind;
    if (primary === undefined) return null;
    return {
      kind: primary,
      instruction: names.find((n) => n.kind === primary)?.name ?? null,
      instructions: names.map((n) => n.name),
      supplyDelta,
      largestMove,
    };
  }
  if (largestMove >= largeTransfer) {
    return {
      kind: "large_transfer",
      instruction: null,
      instructions: [],
      supplyDelta,
      largestMove,
    };
  }
  return null;
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

/** Every minute: new transactions of the OnRe program and of the ONyc mint, classified and stored. */
export const chainActivityJob: Job = {
  name: "chain-activity",
  schedule: "15 * * * * *",
  startDelayMs: 8_000,
  async run(ctx) {
    const rpc = chainRpc(ctx);
    const cursorRow = await latestSnapshot(ctx, "cursor-v2");
    const cursors = (cursorRow?.data ?? {}) as {
      program?: string;
      mint?: string;
      retries?: number;
    };
    const first = cursors.program === undefined;

    const programSigs = await timed(ctx, "getSignaturesForAddress(program)", () =>
      rpc.getSignatures(P, {
        limit: first ? 40 : 100,
        ...(cursors.program ? { until: cursors.program } : {}),
      }),
    );
    const mintSigs = await timed(ctx, "getSignaturesForAddress(mint)", () =>
      rpc.getSignatures(ONYC, {
        limit: first ? 40 : 100,
        ...(cursors.mint ? { until: cursors.mint } : {}),
      }),
    );
    if (programSigs === null && mintSigs === null) return;

    const wanted = new Map<string, { slot: number; blockTime: number | null }>();
    for (const s of [...(programSigs ?? []), ...(mintSigs ?? [])]) {
      if (s.err === null) wanted.set(s.signature, { slot: s.slot, blockTime: s.blockTime });
    }
    const batch = [...wanted.entries()].sort((a, b) => a[1].slot - b[1].slot).slice(0, 40);
    let stored = 0;
    let failed = 0;
    for (const [signature, meta] of batch) {
      const tx = await timed(ctx, "getTransaction", () => rpc.getTransaction(signature));
      if (tx === null) {
        failed += 1;
        continue;
      }
      const c = classify(tx, ctx.config.CHAIN_LARGE_TRANSFER_ONYC);
      if (c === null) continue;
      const ts = new Date(
        (tx.blockTime ?? meta.blockTime ?? Math.floor(ctx.now().getTime() / 1000)) * 1000,
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
          data: { instructions: c.instructions },
          seenAt: ctx.now(),
        })
        .onConflictDoNothing()
        .returning({ id: schema.chainEvents.id });
      if (rows.length === 0) continue;
      stored += 1;
      const notify = NOTIFY[c.kind];
      if (notify !== undefined && Date.now() - ts.getTime() < 6 * 3_600_000) {
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
    }
    // The next run starts after the newest signature we looked at, so nothing is read twice and nothing is skipped.
    const newest = (list: { signature: string }[] | null): string | undefined =>
      list?.[0]?.signature;
    // A transaction that could not be fetched is tried again on the next runs; after five tries it is given up.
    const retries = failed > 0 ? (cursors.retries ?? 0) + 1 : 0;
    const processedAll = wanted.size <= batch.length && (failed === 0 || retries > 5);
    await snapshot(ctx, "cursor-v2", {
      retries: processedAll ? 0 : retries,
      program: processedAll
        ? (newest(programSigs) ?? cursors.program)
        : (cursors.program ?? newest(programSigs)),
      mint: processedAll ? (newest(mintSigs) ?? cursors.mint) : (cursors.mint ?? newest(mintSigs)),
    });
    ctx.log.info({ looked: batch.length, stored, failed }, "chain activity");
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
