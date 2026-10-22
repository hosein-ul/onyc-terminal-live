import { formatRelativeAge } from "@onyc/format";
import { useChainActivity } from "@onyc/sdk/react";
import type { EndpointResponse } from "@onyc/sdk";
import {
  ArrowLeftRight,
  Coins,
  Gauge,
  Landmark,
  LogOut,
  RefreshCw,
  Settings,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { shortAddress } from "../lib/format";
import { Pill } from "./kit";
import { Provenance } from "./Provenance";
import { Skeleton } from "./kit";

type Event = EndpointResponse<"chainActivity">["data"]["events"][number];
type Kind = Event["kind"];

export const KIND_LABEL: Record<Kind, string> = {
  mint: "Mint",
  redeem_request: "Redemption requested",
  redeem_cancelled: "Redemption cancelled",
  redeem_fulfilled: "Redemption fulfilled",
  propamm_sell: "Sold to OnRe (PropAMM)",
  propamm_buy: "Bought from OnRe (PropAMM)",
  price_vector: "Price vector",
  admin_config: "Configuration",
  vault_move: "Vault move",
  market_stats: "Stats refresh",
  large_transfer: "Large transfer",
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
};

const KIND_TONE: Partial<Record<Kind, "accent" | "watch" | "neutral">> = {
  price_vector: "watch",
  admin_config: "watch",
  large_transfer: "accent",
};

export const solscanTx = (signature: string): string => `https://solscan.io/tx/${signature}`;
export const solscanAccount = (address: string): string => `https://solscan.io/account/${address}`;

const amount = (n: number | null): string =>
  n === null
    ? ""
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 0 }).format(
        Math.abs(n),
      );

/** One transaction as a line: what it was, how much ONyc moved, who signed, when, and a link to the block explorer. */
function Row({ e }: { e: Event }) {
  const Icon = KIND_ICON[e.kind];
  const moved = e.onyc !== null && e.onyc > 0 ? `${amount(e.onyc)} ONyc` : "";
  return (
    <li className="chain-row">
      <span className="chain-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="chain-main">
        <div className="chain-what">
          <Pill tone={KIND_TONE[e.kind] ?? "neutral"}>{KIND_LABEL[e.kind]}</Pill>
          {moved !== "" && <b>{moved}</b>}
          {e.instruction !== null && <span className="chain-ins">{e.instruction}</span>}
        </div>
        <div className="chain-sub">
          {formatRelativeAge(e.ts)}
          {e.signer !== null && <> · signer {shortAddress(e.signer)}</>}
        </div>
      </div>
      <a
        className="chain-link"
        href={solscanTx(e.signature)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Solscan<span className="sr-only"> transaction {shortAddress(e.signature)}</span>
      </a>
    </li>
  );
}

/** The newest program events as a list. `kinds` limits it, for example to redemptions only. */
export function ChainFeed({ limit = 10, kinds }: { limit?: number; kinds?: Kind[] }) {
  const q = useChainActivity({
    query: { limit, ...(kinds === undefined ? {} : { kind: kinds.join(",") }) },
  });
  if (q.isLoading) return <Skeleton height={140} />;
  if (q.isError) return <p className="tone-bad">The on-chain activity could not be loaded.</p>;
  const events = q.data?.data.events ?? [];
  return (
    <>
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
