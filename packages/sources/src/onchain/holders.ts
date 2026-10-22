import { KNOWN_PROGRAMS, type Venue } from "./labels.js";
import { encodeBase58 } from "./base58.js";
import type { RpcAccount, SolanaRpc } from "./rpc.js";
import { ATA_PROGRAM, TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./pda.js";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** One token account of the ONyc mint, as returned by a sliced getProgramAccounts (owner at 32, amount at 64). */
export interface RawHolding {
  tokenAccount: string;
  owner: string;
  /** Raw units (9 decimals). */
  amount: bigint;
}

/** Scan every token account of a mint. Worker only: one big call, cached by the caller. */
export async function scanMintHoldings(rpc: SolanaRpc, mint: string): Promise<RawHolding[]> {
  const accounts = await rpc.getProgramAccounts(
    TOKEN_PROGRAM,
    [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
    { offset: 32, length: 40 },
  );
  return accounts.map((a) => toHolding(a));
}

export function toHolding(a: RpcAccount): RawHolding {
  const view = new DataView(a.data.buffer, a.data.byteOffset, a.data.byteLength);
  return {
    tokenAccount: a.pubkey,
    owner: encodeBase58(a.data.subarray(0, 32)),
    amount: view.getBigUint64(32, true),
  };
}

export interface OwnerTotal {
  owner: string;
  amount: bigint;
  accounts: number;
}

/** Sum token accounts by owner, largest first, empty owners dropped. */
export function totalsByOwner(holdings: RawHolding[]): OwnerTotal[] {
  const map = new Map<string, OwnerTotal>();
  for (const h of holdings) {
    if (h.amount === 0n) continue;
    const t = map.get(h.owner) ?? { owner: h.owner, amount: 0n, accounts: 0 };
    t.amount += h.amount;
    t.accounts += 1;
    map.set(h.owner, t);
  }
  return [...map.values()].sort((a, b) => (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0));
}

export interface LabelledHolder extends OwnerTotal {
  /** The program that owns the holder account, or the System program for an ordinary wallet; null for a PDA with no account. */
  ownerProgram: string | null;
  venue: Venue | null;
  kind: "wallet" | "program" | "unknown";
  /** How the label was found: a fixed address, the owner program, or the programs in the account's latest transaction. */
  labelledBy: "address" | "owner-program" | "activity" | null;
}

export interface LabelOptions {
  /** Addresses known from chain state itself, such as the OnRe boss and vault authorities. */
  extra?: Record<string, Venue>;
  /** The raw token accounts, needed to infer a label from activity. */
  holdings?: RawHolding[];
  /** Infer a label from the latest transaction for this many of the largest unlabelled holders. Default 0. */
  inferTop?: number;
}

const IGNORED_PROGRAMS = new Set([
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  ATA_PROGRAM,
  "ComputeBudget111111111111111111111111111111",
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
]);

const KIND_RANK: Venue["kind"][] = ["lending", "yield", "vault", "dex", "onre", "aggregator"];

/** The most specific known venue among the programs a transaction called, or null. */
export function venueFromPrograms(programs: string[]): Venue | null {
  const known = programs
    .filter((p) => !IGNORED_PROGRAMS.has(p))
    .map((p) => KNOWN_PROGRAMS[p])
    .filter((v): v is Venue => v !== undefined);
  known.sort((a, b) => KIND_RANK.indexOf(a.kind) - KIND_RANK.indexOf(b.kind));
  return known[0] ?? null;
}

/**
 * Label holders. A wallet is owned by the System program; a position or vault that is an account is owned by its protocol's
 * program. A program derived address that holds tokens usually has no account at all, so for the largest of those the label
 * is inferred from the programs in the token account's latest transaction (the lending program appears there).
 */
export async function labelHolders(
  rpc: SolanaRpc,
  totals: OwnerTotal[],
  options: LabelOptions = {},
): Promise<LabelledHolder[]> {
  const accounts = await rpc.getMultipleAccounts(totals.map((t) => t.owner));
  const biggest = new Map<string, RawHolding>();
  for (const h of options.holdings ?? []) {
    const cur = biggest.get(h.owner);
    if (cur === undefined || h.amount > cur.amount) biggest.set(h.owner, h);
  }
  const out: LabelledHolder[] = [];
  let inferred = 0;
  for (const [i, t] of totals.entries()) {
    const a = accounts[i] ?? null;
    const program = a === null ? null : a.owner;
    const kind: LabelledHolder["kind"] =
      program === null ? "unknown" : program === SYSTEM_PROGRAM ? "wallet" : "program";
    let venue: Venue | null = options.extra?.[t.owner] ?? null;
    let labelledBy: LabelledHolder["labelledBy"] = venue === null ? null : "address";
    if (venue === null && program !== null) {
      venue = KNOWN_PROGRAMS[program] ?? null;
      if (venue !== null) labelledBy = "owner-program";
    }
    const holding = biggest.get(t.owner);
    if (
      venue === null &&
      kind === "unknown" &&
      holding !== undefined &&
      inferred < (options.inferTop ?? 0)
    ) {
      inferred += 1;
      const sigs = await rpc.getSignatures(holding.tokenAccount, { limit: 2 });
      const programs: string[] = [];
      for (const s of sigs) {
        const tx = await rpc.getTransaction(s.signature);
        for (const ins of tx?.instructions ?? []) programs.push(ins.programId);
      }
      venue = venueFromPrograms(programs);
      if (venue !== null) labelledBy = "activity";
    }
    out.push({ ...t, ownerProgram: program, venue, kind, labelledBy });
  }
  return out;
}

export interface Concentration {
  holders: number;
  /** Share of the supply held by the top N owners, as fractions. */
  top: { n: number; share: number }[];
  gini: number;
}

/** Concentration of non-empty owners. The Gini coefficient uses the standard sorted formula. */
export function concentration(totals: OwnerTotal[], ns: number[] = [10, 100, 1000]): Concentration {
  const values = totals.map((t) => Number(t.amount) / 1e9);
  const sum = values.reduce((a, b) => a + b, 0);
  const sorted = [...values].sort((a, b) => b - a);
  const top = ns.map((n) => ({
    n,
    share: sum === 0 ? 0 : sorted.slice(0, n).reduce((a, b) => a + b, 0) / sum,
  }));
  const asc = [...values].sort((a, b) => a - b);
  const n = asc.length;
  let weighted = 0;
  asc.forEach((v, i) => {
    weighted += (i + 1) * v;
  });
  const gini = n === 0 || sum === 0 ? 0 : (2 * weighted) / (n * sum) - (n + 1) / n;
  return { holders: n, top, gini };
}

export interface HolderDelta {
  owner: string;
  before: bigint;
  after: bigint;
  kind: "new" | "exited" | "grew" | "shrank";
}

/** Whales that appeared or left between two snapshots: owners at or above `threshold` raw units on either side. */
export function whaleMoves(
  before: OwnerTotal[],
  after: OwnerTotal[],
  threshold: bigint,
): HolderDelta[] {
  const b = new Map(before.map((t) => [t.owner, t.amount]));
  const a = new Map(after.map((t) => [t.owner, t.amount]));
  const owners = new Set([...b.keys(), ...a.keys()]);
  const out: HolderDelta[] = [];
  for (const owner of owners) {
    const x = b.get(owner) ?? 0n;
    const y = a.get(owner) ?? 0n;
    if (x < threshold && y < threshold) continue;
    if (x < threshold && y >= threshold) out.push({ owner, before: x, after: y, kind: "new" });
    else if (x >= threshold && y < threshold)
      out.push({ owner, before: x, after: y, kind: "exited" });
  }
  return out;
}

/** ONyc held per protocol, from labelled holders. Unlabelled programs and wallets are kept apart. */
export function byProtocol(holders: LabelledHolder[]): { protocol: string; onyc: number }[] {
  const map = new Map<string, number>();
  for (const h of holders) {
    const key = h.venue?.protocol ?? (h.kind === "wallet" ? "Wallets" : "Other programs");
    map.set(key, (map.get(key) ?? 0) + Number(h.amount) / 1e9);
  }
  return [...map.entries()]
    .map(([protocol, onyc]) => ({ protocol, onyc }))
    .sort((a, b) => b.onyc - a.onyc);
}
