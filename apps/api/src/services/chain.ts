import { and, asc, desc, eq, gte, inArray, schema } from "@onyc/db";
import type { Range, endpoints } from "@onyc/sdk";
import { CONSTANTS, SolanaRpc } from "@onyc/sources";
import type { z } from "zod";
import type { Deps } from "../deps.js";
import {
  isoDate,
  latestDistribution,
  latestSolvency,
  latestTickValue,
  rangeStart,
} from "../loaders.js";
import { num, result, type ServiceResult } from "./common.js";

type Out<K extends keyof typeof endpoints> = z.output<(typeof endpoints)[K]["response"]>["data"];

const MINT_SYMBOL: Record<string, string> = {
  [CONSTANTS.onycMint]: "ONyc",
  [CONSTANTS.usdcMint]: "USDC",
  [CONSTANTS.usdgMint]: "USDG",
  [CONSTANTS.usdtMint]: "USDT",
};
/** Stablecoin raw amounts have 6 decimals; ONyc has 9. */
const DECIMALS: Record<string, number> = {
  [CONSTANTS.onycMint]: 9,
  [CONSTANTS.usdcMint]: 6,
  [CONSTANTS.usdgMint]: 6,
  [CONSTANTS.usdtMint]: 6,
};

export async function latestSnap<T>(
  deps: Deps,
  kind: string,
): Promise<{ ts: Date; data: T } | null> {
  const t = schema.chainSnapshots;
  const row = (
    await deps.handle.db.select().from(t).where(eq(t.kind, kind)).orderBy(desc(t.ts)).limit(1)
  )[0];
  return row === undefined ? null : { ts: row.ts, data: row.data as T };
}

const provider = (deps: Deps): "helius" | "custom" | "public" =>
  deps.config.SOLANA_RPC_URL !== undefined
    ? "custom"
    : deps.config.HELIUS_API_KEY !== undefined
      ? "helius"
      : "public";

interface SupplySnap {
  totalSupply: number;
  circulatingSupply: number;
  excludedHeld: number;
  excludedOwners: string[];
  impliedAumUsd: number;
}
interface StatsSnap {
  nav: number;
  apy: number;
  tvlUsd: number;
  circulatingSupply: number;
  updatedAt: string;
}
interface StateSnap {
  boss: string;
  isKilled: boolean;
  admins: string[];
  worker: string;
  mainOffer: string;
  offers: {
    address: string;
    tokenIn: string;
    disabled: boolean;
    feeBps: number;
    vectors: {
      startTime: number;
      baseTime: number;
      basePrice: number;
      apr: number;
      priceFixDuration: number;
    }[];
  }[];
}
interface RedemptionSnap {
  offers: {
    address: string;
    tokenOut: string;
    executed: number;
    requested: number;
    feeBps: number;
    propAmmFeeBps: number;
    vaultTargetBps: number;
    disabled: boolean;
  }[];
  openRequests: { offer: string; redeemer: string; amount: number; fulfilled: number }[];
  requestAccounts: number;
}
interface VaultSnap {
  authorities: Record<string, string>;
  balances: { holder: string; owner: string; mint: string; amount: number }[];
}

export async function chainStateService(deps: Deps): Promise<ServiceResult<Out<"chainState">>> {
  const [supply, stats, state, red, vaults] = await Promise.all([
    latestSnap<SupplySnap>(deps, "supply"),
    latestSnap<StatsSnap>(deps, "market_stats"),
    latestSnap<StateSnap>(deps, "program_state"),
    latestSnap<RedemptionSnap>(deps, "redemptions"),
    latestSnap<VaultSnap>(deps, "vault_balances"),
  ]);
  const [apiNav, apiApy, apiTvl] = await Promise.all([
    latestTickValue(deps, "nav"),
    latestTickValue(deps, "apy"),
    latestTickValue(deps, "tvl"),
  ]);
  const solv = await latestSolvency(deps);
  const threshold = deps.config.CHAIN_AUM_GAP_ALERT;

  const nav = stats?.data.nav ?? null;
  const impliedAum = supply === null || nav === null ? null : supply.data.totalSupply * nav;
  const apiAum = apiTvl?.value ?? null;
  const gap = (a: number | null, b: number | null): number | null =>
    a === null || b === null || b === 0 ? null : (a - b) / b;

  const vaultRows = (vaults?.data.balances ?? []).map((b) => {
    const decimals = DECIMALS[b.mint] ?? 0;
    const amount = decimals === 0 ? b.amount : b.amount / 10 ** decimals;
    const stable =
      b.mint === CONSTANTS.usdcMint ||
      b.mint === CONSTANTS.usdgMint ||
      b.mint === CONSTANTS.usdtMint;
    return {
      holder: b.holder,
      mint: b.mint,
      symbol: MINT_SYMBOL[b.mint] ?? null,
      amount,
      valueUsd: stable
        ? amount
        : b.mint === CONSTANTS.onycMint && nav !== null
          ? amount * nav
          : null,
    };
  });
  const custodyVisible = vaultRows.reduce((sum, v) => sum + (v.valueUsd ?? 0), 0);
  const stableOf = (mint: string): string | null => MINT_SYMBOL[mint] ?? null;

  return result(
    {
      provider: {
        name: provider(deps),
        heliusConfigured: deps.config.HELIUS_API_KEY !== undefined,
      },
      program: {
        id: CONSTANTS.onreProgram,
        mint: CONSTANTS.onycMint,
        boss: state?.data.boss ?? null,
        isKilled: state?.data.isKilled ?? null,
        worker: state?.data.worker ?? null,
        admins: state?.data.admins ?? [],
        mainOffer: state?.data.mainOffer ?? null,
      },
      supply:
        supply === null
          ? null
          : {
              total: supply.data.totalSupply,
              circulating: supply.data.circulatingSupply,
              excludedHeld: supply.data.excludedHeld,
              excludedOwners: supply.data.excludedOwners,
            },
      stats:
        stats === null
          ? null
          : {
              nav: stats.data.nav,
              apy: stats.data.apy,
              tvlUsd: stats.data.tvlUsd,
              circulating: stats.data.circulatingSupply,
              updatedAt: stats.data.updatedAt,
              apiNav: apiNav?.value ?? null,
              apiApy: apiApy?.value ?? null,
              apiTvl: apiAum,
              navDifference: num(apiNav === null ? null : stats.data.nav - apiNav.value),
            },
      solvency: {
        impliedAumUsd: impliedAum,
        apiAumUsd: apiAum,
        accountableReservesUsd: solv?.reservesUsd ?? null,
        accountableSupplyUsd: solv?.supplyUsd ?? null,
        gapApi: gap(apiAum, impliedAum),
        gapAccountable: gap(solv?.reservesUsd ?? null, impliedAum),
        threshold,
        custodyVisibleUsd: vaults === null ? null : custodyVisible,
        note: "On-chain supply times the program's own NAV is an independent measure of what holders are owed. Most reserves (T-bills, collateral) sit off chain, so the custody visible on chain is small by design; Accountable's attestation is what covers the rest.",
      },
      offers: (state?.data.offers ?? []).map((o) => ({
        address: o.address,
        tokenIn: o.tokenIn,
        tokenInSymbol: stableOf(o.tokenIn),
        feeBps: o.feeBps,
        disabled: o.disabled,
        vectors: o.vectors,
      })),
      redemptions: {
        offers: (red?.data.offers ?? []).map((o) => ({
          ...o,
          tokenOutSymbol: stableOf(o.tokenOut),
        })),
        openRequests: red?.data.openRequests ?? [],
        requestAccounts: red?.data.requestAccounts ?? 0,
      },
      vaults: vaultRows,
      updatedAt: (stats?.ts ?? supply?.ts ?? null)?.toISOString() ?? null,
    },
    {
      provider: "derived",
      program: "chain",
      supply: "chain",
      stats: "chain",
      solvency: "chain",
      offers: "chain",
      redemptions: "chain",
      vaults: "chain",
      updatedAt: "chain",
    },
  );
}

const ACTIVITY_KINDS = new Set([
  "mint",
  "redeem_request",
  "redeem_cancelled",
  "redeem_fulfilled",
  "propamm_sell",
  "propamm_buy",
  "price_vector",
  "admin_config",
  "vault_move",
  "market_stats",
  "large_transfer",
]);

export async function chainActivityService(
  deps: Deps,
  q: { kind?: string | undefined; limit: number },
): Promise<ServiceResult<Out<"chainActivity">>> {
  const t = schema.chainEvents;
  const kinds =
    q.kind === undefined ? null : q.kind.split(",").filter((k) => ACTIVITY_KINDS.has(k));
  const base = deps.handle.db.select().from(t);
  const rows = await (
    kinds === null || kinds.length === 0 ? base : base.where(inArray(t.kind, kinds))
  )
    .orderBy(desc(t.ts))
    .limit(q.limit);
  const all = await deps.handle.db.select({ kind: t.kind, ts: t.ts }).from(t);
  const counts: Record<string, number> = {};
  let since: Date | null = null;
  for (const r of all) {
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    if (since === null || r.ts < since) since = r.ts;
  }
  return result(
    {
      events: rows.map((r) => ({
        signature: r.signature,
        kind: r.kind as Out<"chainActivity">["events"][number]["kind"],
        instruction: r.instruction,
        ts: r.ts.toISOString(),
        slot: r.slot,
        signer: r.signer,
        onyc: num(r.onycLargestMove),
        supplyDelta: num(r.onycSupplyDelta),
      })),
      counts,
      since: since?.toISOString() ?? null,
      note: "Read from Solana by instruction data; the worker polls about once a minute. History starts when collection started.",
    },
    { events: "chainActivity", counts: "chainActivity", since: "chainActivity", note: "derived" },
  );
}

export async function chainFlowsService(
  deps: Deps,
  range: Range,
): Promise<ServiceResult<Out<"chainFlows">>> {
  const from = rangeStart(range, isoDate(deps.now()));
  const since = from === null ? new Date(0) : new Date(`${from}T00:00:00Z`);
  const t = schema.chainEvents;
  const rows = await deps.handle.db
    .select()
    .from(t)
    .where(
      and(
        gte(t.ts, since),
        inArray(t.kind, [
          "mint",
          "redeem_fulfilled",
          "propamm_sell",
          "propamm_buy",
          "redeem_request",
          "redeem_cancelled",
        ]),
      ),
    )
    .orderBy(asc(t.ts));
  const navRows = await deps.handle.db
    .select()
    .from(schema.navDaily)
    .where(gte(schema.navDaily.date, isoDate(since)));
  const navOn = new Map(navRows.map((n) => [n.date, n.nav]));
  const days = new Map<string, { minted: number; burned: number; transactions: number }>();
  for (const r of rows) {
    const d = isoDate(r.ts);
    const x = days.get(d) ?? { minted: 0, burned: 0, transactions: 0 };
    const delta = r.onycSupplyDelta ?? 0;
    if (delta > 0) x.minted += delta;
    else x.burned += -delta;
    x.transactions += 1;
    days.set(d, x);
  }
  const series = [...days.entries()].map(([date, x]) => {
    const nav = navOn.get(date) ?? null;
    const net = x.minted - x.burned;
    return {
      date,
      minted: x.minted,
      burned: x.burned,
      net,
      nav,
      netUsd: nav === null ? null : net * nav,
      transactions: x.transactions,
    };
  });
  const totals = series.reduce(
    (a, s) => ({
      minted: a.minted + s.minted,
      burned: a.burned + s.burned,
      net: a.net + s.net,
      netUsd: s.netUsd === null ? a.netUsd : (a.netUsd ?? 0) + s.netUsd,
    }),
    { minted: 0, burned: 0, net: 0, netUsd: null as number | null },
  );
  // The API's own estimate for the same window, from supply changes (see /v1/flows).
  const apiRows = await deps.handle.db
    .select()
    .from(schema.navDaily)
    .where(gte(schema.navDaily.date, isoDate(since)))
    .orderBy(asc(schema.navDaily.date));
  let apiNet: number | null = null;
  const first = rows[0]?.ts;
  if (first !== undefined) {
    const startDate = isoDate(first);
    const inWindow = apiRows.filter((r) => r.date >= startDate && r.circulatingSupply !== null);
    if (inWindow.length >= 2) {
      apiNet = 0;
      for (let i = 1; i < inWindow.length; i++) {
        const a = inWindow[i - 1];
        const b = inWindow[i];
        if (a?.circulatingSupply != null && b?.circulatingSupply != null)
          apiNet += (b.circulatingSupply - a.circulatingSupply) * b.nav;
      }
    }
  }
  return result(
    {
      range,
      series,
      totals,
      apiNetFlowUsd: apiNet,
      since: first?.toISOString() ?? null,
      note: "Minted and burned ONyc are summed from program transactions (the change in supply in each one). The API's figure is estimated from the daily change in circulating supply, so the two can differ by the boss wallet's movements and by timing.",
    },
    {
      range: "derived",
      series: "chainActivity",
      totals: "chainActivity",
      apiNetFlowUsd: "navHistory",
      since: "chainActivity",
      note: "derived",
    },
  );
}

const PROTOCOL_ALIASES: Record<string, string> = { wallets: "wallet" };

export async function chainHoldersService(deps: Deps): Promise<ServiceResult<Out<"chainHolders">>> {
  const t = schema.chainHolders;
  const newest = (
    await deps.handle.db.select({ scanTs: t.scanTs }).from(t).orderBy(desc(t.scanTs)).limit(1)
  )[0];
  const stats = await latestSnap<{
    holders: number;
    gini: number;
    top: { n: number; share: number }[];
    byProtocol: { protocol: string; onyc: number }[];
  }>(deps, "holder_stats");
  const nav = (await latestTickValue(deps, "nav"))?.value ?? null;
  const supply = await latestSnap<SupplySnap>(deps, "supply");
  const total = supply?.data.totalSupply ?? null;
  const rows =
    newest === undefined
      ? []
      : await deps.handle.db
          .select()
          .from(t)
          .where(eq(t.scanTs, newest.scanTs))
          .orderBy(asc(t.rank))
          .limit(100);

  const dist = await latestDistribution(deps);
  const api = new Map(dist.rows.map((r) => [r.protocol.toLowerCase(), r.capitalUsd]));
  const byProtocol = (stats?.data.byProtocol ?? []).map((p) => ({
    protocol: p.protocol,
    onyc: p.onyc,
    usd: nav === null ? null : p.onyc * nav,
  }));
  const crossCheck = byProtocol
    .filter((p) =>
      api.has((PROTOCOL_ALIASES[p.protocol.toLowerCase()] ?? p.protocol).toLowerCase()),
    )
    .map((p) => {
      const apiUsd =
        api.get((PROTOCOL_ALIASES[p.protocol.toLowerCase()] ?? p.protocol).toLowerCase()) ?? null;
      const onchainUsd = p.usd ?? 0;
      return {
        protocol: p.protocol,
        onchainUsd,
        apiUsd,
        differencePct: apiUsd === null || apiUsd === 0 ? null : (onchainUsd - apiUsd) / apiUsd,
      };
    });

  const events = await deps.handle.db
    .select()
    .from(schema.events)
    .where(inArray(schema.events.kind, ["whale_new", "whale_exit"]))
    .orderBy(desc(schema.events.ts))
    .limit(10);
  const whales = events.flatMap((e) => {
    const d = e.data as { owner?: string; before?: number; after?: number } | null;
    return d?.owner === undefined
      ? []
      : [
          {
            ts: e.ts.toISOString(),
            kind: e.kind === "whale_new" ? ("new" as const) : ("exited" as const),
            owner: d.owner,
            before: d.before ?? 0,
            after: d.after ?? 0,
          },
        ];
  });

  return result(
    {
      scanTs: newest?.scanTs.toISOString() ?? null,
      holders: stats?.data.holders ?? null,
      gini: stats?.data.gini ?? null,
      top: stats?.data.top ?? [],
      rows: rows.map((r) => ({
        rank: r.rank,
        owner: r.owner,
        amount: r.amount,
        share: total === null || total === 0 ? 0 : r.amount / total,
        tokenAccounts: r.tokenAccounts,
        kind: r.kind as "wallet" | "program" | "unknown",
        protocol: r.protocol,
        label: r.label,
        labelledBy: r.labelledBy as "address" | "owner-program" | "activity" | null,
      })),
      byProtocol,
      crossCheck,
      whales,
      note: "Every token account of the ONyc mint is read hourly and summed by owner. A holder is labelled when its account is owned by a known program, when it is a program-owned address whose latest transaction calls one, or when it is an OnRe address. Unlabelled holders are shown as they are, not guessed.",
    },
    {
      scanTs: "chainHolders",
      holders: "chainHolders",
      gini: "chainHolders",
      top: "chainHolders",
      rows: "chainHolders",
      byProtocol: "chainHolders",
      crossCheck: "capital",
      whales: "derived",
      note: "derived",
    },
  );
}

let rpcCache: SolanaRpc | null = null;
/** One client for on-demand reads from the API (a single wallet's balance); the heavy scans stay in the worker. */
export function apiRpc(deps: Deps): SolanaRpc {
  rpcCache ??= new SolanaRpc({
    heliusKey: deps.config.HELIUS_API_KEY,
    url: deps.config.SOLANA_RPC_URL,
    ...(deps.fetchOptions.fetchImpl ? { fetchImpl: deps.fetchOptions.fetchImpl } : {}),
    ...(deps.fetchOptions.sleep ? { sleep: deps.fetchOptions.sleep } : {}),
    retries: 1,
  });
  return rpcCache;
}
