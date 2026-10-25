import { formatRelativeAge } from "@onyc/format";
import { useChainActivity, useChainHolders } from "@onyc/sdk/react";
import type { EndpointResponse } from "@onyc/sdk";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Coins,
  Gauge,
  Landmark,
  LogOut,
  RefreshCw,
  Settings,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { shortAddress } from "../lib/format";
import { LIVE_MODE, setLiveVenues, useLiveChain } from "../lib/liveChain";
import { useNow } from "../lib/useNow";
import { WalletLink } from "../lib/wallet";
import { Pill } from "./kit";
import { Provenance } from "./Provenance";
import { Skeleton } from "./kit";

type Event = EndpointResponse<"chainActivity">["data"]["events"][number];
type Kind = Event["kind"];

export const KIND_LABEL: Record<Kind, string> = {
  mint: "Deposit",
  redeem_request: "Withdrawal requested",
  redeem_cancelled: "Withdrawal cancelled",
  redeem_fulfilled: "Withdrawal paid",
  propamm_sell: "Sold to OnRe (PropAMM)",
  propamm_buy: "Bought from OnRe (PropAMM)",
  price_vector: "Price update",
  admin_config: "Configuration",
  vault_move: "Vault move",
  market_stats: "Stats refresh",
  large_transfer: "Transfer",
  venue_in: "Moved into a protocol",
  venue_out: "Moved out of a protocol",
};

const KIND_ICON: Record<Kind, LucideIcon> = {
  mint: Coins,
  redeem_request: LogOut,
  redeem_cancelled: Undo2,
  redeem_fulfilled: LogOut,
  propamm_sell: ArrowLeftRight,
  propamm_buy: ArrowLeftRight,
  price_vector: Gauge,
  admin_config: Settings,
  vault_move: Landmark,
  market_stats: RefreshCw,
  large_transfer: ArrowLeftRight,
  venue_in: ArrowDownToLine,
  venue_out: ArrowUpFromLine,
};

const KIND_TONE: Partial<Record<Kind, "accent" | "watch" | "neutral">> = {
  price_vector: "watch",
  admin_config: "watch",
  large_transfer: "accent",
};

/** Every kind of event the feed knows, the program's own upkeep included. */
export const ALL_KINDS = Object.keys(KIND_LABEL) as Kind[];

/** What people do with ONyc; the program's own upkeep (prices, stats, configuration, vault moves) is a separate view. */
export const PEOPLE_KINDS: Kind[] = [
  "mint",
  "redeem_request",
  "redeem_fulfilled",
  "redeem_cancelled",
  "propamm_sell",
  "propamm_buy",
  "large_transfer",
  "venue_in",
  "venue_out",
];

export const solscanTx = (signature: string): string => `https://solscan.io/tx/${signature}`;
export const solscanAccount = (address: string): string => `https://solscan.io/account/${address}`;

const amount = (n: number | null): string =>
  n === null
    ? ""
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 }).format(
        Math.abs(n),
      );

/** The words for one event: a move into a protocol reads as a deposit, or as a sale when the protocol is an exchange pool. */
export function eventLabel(e: Pick<Event, "kind" | "venue" | "venueKind">): string {
  if (e.venue === null || (e.kind !== "venue_in" && e.kind !== "venue_out"))
    return KIND_LABEL[e.kind];
  const dex = e.venueKind === "dex";
  if (e.kind === "venue_in") return dex ? `Sold on ${e.venue}` : `Deposit to ${e.venue}`;
  return dex ? `Bought on ${e.venue}` : `Withdrawal from ${e.venue}`;
}

/** One transaction as a line: what it was, how much ONyc moved, the transaction and signer addresses, and when. */
function Row({ e }: { e: Event }) {
  const { pathname } = useLocation();
  const txHref = (signature: string): string => `${pathname}?tx=${signature}`;
  const Icon = KIND_ICON[e.kind];
  const moved = e.onyc !== null && e.onyc > 0 ? `${amount(e.onyc)} ONyc` : "";
  return (
    <li className="chain-row">
      <span className="chain-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="chain-main">
        <div className="chain-what">
          <Pill tone={KIND_TONE[e.kind] ?? "neutral"}>{eventLabel(e)}</Pill>
          {moved !== "" && <b>{moved}</b>}
          {e.instruction !== null && <span className="chain-ins">{e.instruction}</span>}
        </div>
        <div className="chain-sub">
          <Link className="mono" to={txHref(e.signature)} title={e.signature}>
            {shortAddress(e.signature)}
          </Link>
          {e.signer !== null && (
            <>
              {" · signer "}
              <WalletLink address={e.signer} />
            </>
          )}
        </div>
      </div>
      <span className="chain-age">{formatRelativeAge(e.ts)}</span>
      <Link className="chain-link" to={txHref(e.signature)}>
        View<span className="sr-only"> transaction {shortAddress(e.signature)}</span>
      </Link>
    </li>
  );
}

/** The newest ONyc events as a list: deposits, withdrawals and large transfers unless `kinds` says otherwise. */
export function ChainFeed({
  limit = 10,
  kinds = PEOPLE_KINDS,
}: {
  limit?: number;
  kinds?: Kind[];
}) {
  const q = useChainActivity({ query: { limit, kind: kinds.join(",") } });
  const holders = useChainHolders();
  const live = useLiveChain();
  useNow(10_000);
  useEffect(() => {
    if (holders.data !== undefined) setLiveVenues(holders.data.data.rows);
  }, [holders.data]);
  if (q.isLoading) return <Skeleton height={140} />;
  if (q.isError) return <p className="tone-bad">The on-chain activity could not be loaded.</p>;
  // Transactions seen on the chain a moment ago come first; the stored list fills in the rest and wins on a tie.
  const stored = q.data?.data.events ?? [];
  const known = new Set(stored.map((e) => e.signature));
  const fresh = live.events.filter((e) => kinds.includes(e.kind) && !known.has(e.signature));
  const events = [...fresh, ...stored]
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, limit);
  return (
    <>
      <p className={`live-status live-${live.status}`}>
        <span className="ticker-dot" aria-hidden="true" />
        {live.status === "live"
          ? LIVE_MODE === "stream"
            ? "Live from Solana"
            : "Live from Solana, checked every few seconds"
          : live.status === "connecting"
            ? "Connecting to Solana…"
            : "Reconnecting to Solana…"}
      </p>
      {events.length === 0 ? (
        <p className="tone-neutral">
          No program transactions recorded yet. The worker reads Solana about once a minute, and
          history starts when collection starts.
        </p>
      ) : (
        <ul className="chain-feed">
          {events.map((e) => (
            <Row key={`${e.signature}-${e.kind}`} e={e} />
          ))}
        </ul>
      )}
      <Provenance meta={q.data?.meta["events"]} />
    </>
  );
}

/** A slim strip of the latest events, for the top of a page. It does not animate, so it needs no reduced-motion rule. */
export function ChainTicker() {
  const q = useChainActivity({ query: { limit: 6 } });
  const events = q.data?.data.events ?? [];
  if (events.length === 0) return null;
  return (
    <div className="ticker" role="region" aria-label="Latest on-chain activity">
      <span className="ticker-live">
        <span className="ticker-dot" aria-hidden="true" /> On chain
      </span>
      <ul>
        {events.map((e) => (
          <li key={`${e.signature}-${e.kind}`}>
            <a href={solscanTx(e.signature)} target="_blank" rel="noopener noreferrer">
              {KIND_LABEL[e.kind]}
              {e.onyc !== null && e.onyc > 0 ? ` ${amount(e.onyc)}` : ""}
              <span className="ticker-age"> {formatRelativeAge(e.ts)}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
