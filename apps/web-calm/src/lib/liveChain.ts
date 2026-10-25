import type { EndpointResponse } from "@onyc/sdk";
import {
  KNOWN_PROGRAMS,
  ONRE_PROGRAM,
  ONYC_MINT,
  classify,
  parseTransaction,
  type Venue,
} from "@onyc/sources/live";
import { useSyncExternalStore } from "react";

export type LiveEvent = EndpointResponse<"chainActivity">["data"]["events"][number];
export type LiveStatus = "connecting" | "live" | "reconnecting";

interface Snapshot {
  events: readonly LiveEvent[];
  status: LiveStatus;
  /** When the last message came from the chain, in ms; 0 before the first. */
  heardAt: number;
  /** Transactions announced and transactions whose details could not be read. */
  heard: number;
  unread: number;
}

/**
 * With a Helius key the page holds a WebSocket and hears every transaction as it is confirmed. Without one it asks a public
 * endpoint that allows browsers for new signatures every few seconds: the api.mainnet-beta.solana.com endpoint refuses browsers,
 * and the other free ones do not offer subscriptions.
 */
const KEY = (import.meta.env["VITE_HELIUS_API_KEY"] as string | undefined)?.trim();
const STREAM = KEY !== undefined && KEY !== "";
const RPC_URL = STREAM
  ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(KEY)}`
  : "https://solana-rpc.publicnode.com";
const WS_URL = STREAM ? `wss://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(KEY)}` : "";
export const LIVE_MODE: "stream" | "poll" = STREAM ? "stream" : "poll";
const POLL_MS = 3_000;
const WATCHED = [ONRE_PROGRAM, ONYC_MINT];

/** Same sizes the worker uses, so a live row and the stored row of the same transaction agree. */
// No size filter: any transaction that moves ONyc is shown.
const TRANSFER_MIN_ONYC = 1e-9;
const VENUE_MOVE_ONYC = 1e-9;
const KEEP = 200;

let snapshot: Snapshot = { events: [], status: "connecting", heardAt: 0, heard: 0, unread: 0 };
const listeners = new Set<() => void>();
let venues: ReadonlyMap<string, Venue> = new Map();
const seen = new Set<string>();
/** What just happened is read before the backlog, and the backlog newest first, so the top of the list fills at once. */
const queue: string[] = [];
const backlog: string[] = [];
/** Reads in flight at once; the public fallback endpoint gets one at a time. */
const PARALLEL = STREAM ? 4 : 1;
let draining = false;
let socket: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let pingTimer: ReturnType<typeof setInterval> | undefined;
let watchTimer: ReturnType<typeof setInterval> | undefined;
let openedAt = 0;

const publish = (next: Partial<Snapshot>): void => {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
};

/** The labelled holders (Kamino, Exponent, Orca and so on), so a move into one of them reads as a deposit. */
export function setLiveVenues(
  rows: readonly { owner: string; protocol: string | null; label: string | null }[],
): void {
  const kinds = new Map(Object.values(KNOWN_PROGRAMS).map((v) => [v.label, v.kind]));
  const map = new Map<string, Venue>();
  for (const r of rows) {
    if (r.protocol === null || r.label === null || r.protocol === "OnRe") continue;
    map.set(r.owner, {
      label: r.label,
      protocol: r.protocol,
      kind: kinds.get(r.label) ?? "lending",
    });
  }
  venues = map;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchTransaction(
  signature: string,
): Promise<ReturnType<typeof parseTransaction> | null> {
  // A transaction announced as confirmed can take a moment to be readable, so the first reads may come back empty.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            { encoding: "json", maxSupportedTransactionVersion: 1, commitment: "confirmed" },
          ],
        }),
      });
      if (response.ok) {
        const body = (await response.json()) as { result?: unknown };
        if (body.result !== null && body.result !== undefined)
          return parseTransaction(signature, body.result as Parameters<typeof parseTransaction>[1]);
      }
    } catch {
      /* try again */
    }
    await sleep(response429Delay(attempt));
  }
  return null;
}

const response429Delay = (attempt: number): number => 350 + attempt * 350;

async function handle(signature: string): Promise<void> {
  const tx = await fetchTransaction(signature);
  if (tx === null) {
    publish({ unread: snapshot.unread + 1 });
    return;
  }
  const c = classify(tx, TRANSFER_MIN_ONYC, resolve(tx), VENUE_MOVE_ONYC);
  if (c === null) return;
  const event: LiveEvent = {
    signature,
    kind: c.kind,
    instruction: c.instruction,
    ts: new Date((tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    slot: tx.slot,
    signer: tx.signer,
    onyc: c.largestMove,
    supplyDelta: c.supplyDelta,
    venue: c.venue?.label ?? null,
    venueKind: c.venue?.kind ?? null,
  };
  publish({ events: [event, ...snapshot.events].slice(0, KEEP) });
}

/** The labelled owners among the ONyc balance holders of one transaction. */
function resolve(tx: ReturnType<typeof parseTransaction>): ReadonlyMap<string, Venue> {
  const found = new Map<string, Venue>();
  for (const b of [...tx.preTokenBalances, ...tx.postTokenBalances]) {
    if (b.mint !== ONYC_MINT || b.owner === undefined) continue;
    const v = venues.get(b.owner);
    if (v !== undefined) found.set(b.owner, v);
  }
  return found;
}

/** One transaction at a time and a short gap, so the public endpoint is never pushed past its limit. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const next = (): string | undefined => queue.shift() ?? backlog.shift();
    const worker = async (): Promise<void> => {
      for (let sig = next(); sig !== undefined; sig = next()) {
        await handle(sig);
        if (!STREAM) await sleep(150);
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  } finally {
    draining = false;
  }
}

function onMessage(data: unknown): void {
  let msg: {
    method?: string;
    params?: { result?: { value?: { signature?: string; err?: unknown } } };
  };
  try {
    msg = JSON.parse(String(data)) as typeof msg;
  } catch {
    return;
  }
  if (msg.method !== "logsNotification") return;
  publish({ heardAt: Date.now(), heard: snapshot.heard + 1 });
  const v = msg.params?.result?.value;
  if (v?.signature === undefined || (v.err !== null && v.err !== undefined)) return;
  if (seen.has(v.signature)) return;
  seen.add(v.signature);
  if (seen.size > 2_000) seen.delete(seen.values().next().value as string);
  queue.push(v.signature);
  void drain();
}

const cursors = new Map<string, string>();
let storedUntil = 0;
let backfilled = false;
const BACKFILL_MAX = 150;

/** Tell the live feed how far the stored list reaches, so it can read what happened after that. */
export function setLiveSince(iso: string | undefined): void {
  const t = iso === undefined ? 0 : new Date(iso).getTime();
  if (t > storedUntil) storedUntil = t;
  if (!backfilled && storedUntil > 0 && listeners.size > 0) void backfill();
}

/** Once per page: transactions newer than the stored list, oldest first, at most BACKFILL_MAX of them. */
async function backfill(): Promise<void> {
  if (backfilled || storedUntil === 0) return;
  backfilled = true;
  try {
    const fresh: { signature: string; blockTime: number }[] = [];
    for (const address of WATCHED) {
      const list = await rpc<{ signature: string; err: unknown; blockTime: number | null }[]>(
        "getSignaturesForAddress",
        [address, { limit: 300, commitment: "confirmed" }],
      );
      for (const item of list) {
        if (item.err !== null || item.blockTime === null || seen.has(item.signature)) continue;
        if (item.blockTime * 1000 <= storedUntil) continue;
        seen.add(item.signature);
        fresh.push({ signature: item.signature, blockTime: item.blockTime });
      }
    }
    fresh.sort((a, b) => b.blockTime - a.blockTime);
    for (const f of fresh.slice(0, BACKFILL_MAX)) backlog.push(f.signature);
    void drain();
  } catch {
    backfilled = false;
  }
}
let pollTimer: ReturnType<typeof setTimeout> | undefined;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json()) as { result?: T; error?: unknown };
  if (body.result === undefined) throw new Error("no result");
  return body.result;
}

/** One look at both addresses: anything newer than the last signature seen is queued, oldest first. */
async function poll(): Promise<void> {
  try {
    for (const address of WATCHED) {
      const until = cursors.get(address);
      const list = await rpc<{ signature: string; err: unknown }[]>("getSignaturesForAddress", [
        address,
        { limit: 25, commitment: "confirmed", ...(until === undefined ? {} : { until }) },
      ]);
      const newest = list[0]?.signature;
      if (newest !== undefined) cursors.set(address, newest);
      // The first look only marks where the chain is now; the stored feed already covers what came before.
      if (until === undefined) continue;
      for (const item of [...list].reverse()) {
        if (item.err !== null || seen.has(item.signature)) continue;
        seen.add(item.signature);
        queue.push(item.signature);
      }
    }
    void drain();
    if (snapshot.status !== "live") publish({ status: "live" });
    retry = 0;
  } catch {
    retry += 1;
    publish({ status: "reconnecting" });
  }
  if (listeners.size > 0)
    pollTimer = setTimeout(() => void poll(), Math.min(30_000, POLL_MS * 2 ** Math.min(retry, 3)));
}

function connect(): void {
  if (listeners.size === 0) return;
  if (!STREAM) {
    void poll();
    return;
  }
  publish({ status: retry === 0 ? "connecting" : "reconnecting" });
  const ws = new WebSocket(WS_URL);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    openedAt = Date.now();
    publish({ status: "live" });
    // Two subscriptions: the OnRe program (deposits, withdrawals) and the ONyc mint (moves to and from other protocols).
    [ONRE_PROGRAM, ONYC_MINT].forEach((address, i) => {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: i + 1,
          method: "logsSubscribe",
          params: [{ mentions: [address] }, { commitment: "confirmed" }],
        }),
      );
    });
    watchTimer = setInterval(() => {
      const quiet = Date.now() - Math.max(snapshot.heardAt, openedAt);
      if (quiet > 120_000 && ws.readyState === WebSocket.OPEN) ws.close();
    }, 30_000);
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "getSlot" }));
    }, 240_000);
  };
  ws.onmessage = (e) => {
    onMessage(e.data);
  };
  const lost = (): void => {
    clearInterval(pingTimer);
    clearInterval(watchTimer);
    if (socket !== ws) return;
    socket = null;
    if (listeners.size === 0) return;
    publish({ status: "reconnecting" });
    retry += 1;
    retryTimer = setTimeout(connect, Math.min(30_000, 1_000 * 2 ** Math.min(retry, 5)));
  };
  ws.onclose = lost;
  ws.onerror = () => {
    ws.close();
  };
}

/** Close the connection and every timer; what was already read stays on the page. */
function halt(): void {
  clearTimeout(retryTimer);
  clearTimeout(pollTimer);
  pollTimer = undefined;
  cursors.clear();
  clearInterval(pingTimer);
  clearInterval(watchTimer);
  const ws = socket;
  socket = null;
  ws?.close();
}

/** A background tab does not listen: every transaction read costs the RPC provider a request. */
function onVisibility(): void {
  if (document.visibilityState === "hidden") halt();
  else if (listeners.size > 0 && socket === null && pollTimer === undefined) {
    retry = 0;
    connect();
    backfilled = false;
    void backfill();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener("visibilitychange", onVisibility);
    if (document.visibilityState === "visible" && socket === null && pollTimer === undefined)
      connect();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      document.removeEventListener("visibilitychange", onVisibility);
      halt();
    }
  };
}

/** The transactions seen on the chain since the page opened, newest first, read straight from Solana. */
export function useLiveChain(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot);
}
