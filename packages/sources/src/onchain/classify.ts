import { ONRE_PROGRAM, ONYC_MINT } from "./ids.js";
import { KIND_PRIORITY, identifyInstruction, type ChainEventKind } from "./instructions.js";
import type { Venue } from "./labels.js";
import type { ParsedTransaction } from "./rpc.js";

const P = ONRE_PROGRAM;
const ONYC = ONYC_MINT;
const DECIMALS = 1e9;

export interface ClassifiedTx {
  kind: ChainEventKind;
  instruction: string | null;
  instructions: string[];
  /** Change in ONyc supply, whole tokens (mints positive, burns negative). */
  supplyDelta: number;
  /** Largest single ONyc balance change, whole tokens (absolute). */
  largestMove: number;
  /** The protocol an ONyc move went into or out of, for venue_in and venue_out. */
  venue: { label: string; kind: string } | null;
}

/** Owners of ONyc token accounts that are accounts of a known protocol, by owner address. */
export type VenueMap = ReadonlyMap<string, Venue>;

/** The ONyc a transaction moved into (positive) or out of (negative) the protocol that moved most. */
export function venueMove(
  tx: ParsedTransaction,
  venues: VenueMap,
): { venue: Venue; net: number } | null {
  const pre = new Map<number, bigint>();
  for (const b of tx.preTokenBalances)
    if (b.mint === ONYC) pre.set(b.accountIndex, BigInt(b.uiTokenAmount.amount));
  const net = new Map<string, bigint>();
  const add = (owner: string | undefined, d: bigint): void => {
    if (owner === undefined || !venues.has(owner)) return;
    net.set(owner, (net.get(owner) ?? 0n) + d);
  };
  const seen = new Set<number>();
  for (const b of tx.postTokenBalances) {
    if (b.mint !== ONYC) continue;
    seen.add(b.accountIndex);
    add(b.owner, BigInt(b.uiTokenAmount.amount) - (pre.get(b.accountIndex) ?? 0n));
  }
  for (const b of tx.preTokenBalances)
    if (b.mint === ONYC && !seen.has(b.accountIndex)) add(b.owner, -BigInt(b.uiTokenAmount.amount));
  // Moves between two accounts of the same protocol cancel out, so sum per protocol before comparing.
  const byProtocol = new Map<string, { venue: Venue; net: bigint }>();
  for (const [owner, d] of net) {
    const venue = venues.get(owner);
    if (venue === undefined) continue;
    const hit = byProtocol.get(venue.protocol);
    if (hit === undefined) byProtocol.set(venue.protocol, { venue, net: d });
    else hit.net += d;
  }
  let best: { venue: Venue; net: bigint } | null = null;
  for (const v of byProtocol.values()) {
    const abs = v.net < 0n ? -v.net : v.net;
    const bestAbs = best === null ? 0n : best.net < 0n ? -best.net : best.net;
    if (abs > bestAbs) best = v;
  }
  return best === null ? null : { venue: best.venue, net: Number(best.net) / DECIMALS };
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
export function classify(
  tx: ParsedTransaction,
  largeTransfer: number,
  venues: VenueMap = new Map(),
  venueMin = Number.POSITIVE_INFINITY,
): ClassifiedTx | null {
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
      venue: null,
    };
  }
  const move = venues.size === 0 ? null : venueMove(tx, venues);
  if (move !== null && Math.abs(move.net) >= venueMin) {
    return {
      kind: move.net > 0 ? "venue_in" : "venue_out",
      instruction: null,
      instructions: [],
      supplyDelta,
      largestMove: Math.abs(move.net),
      venue: { label: move.venue.label, kind: move.venue.kind },
    };
  }
  if (largestMove >= largeTransfer) {
    return {
      kind: "large_transfer",
      instruction: null,
      instructions: [],
      supplyDelta,
      largestMove,
      venue: null,
    };
  }
  return null;
}
