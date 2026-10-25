import { chainFlowsSpec, type ChartSpec } from "@onyc/chart-specs";
import { formatRelativeAge } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useChainActivity, useChainFlows } from "@onyc/sdk/react";
import { useMemo, useState } from "react";
import { Panel } from "../charts";
import { useNow } from "../lib/useNow";
import { ALL_KINDS, ChainFeed, PEOPLE_KINDS } from "../ui/ChainFeed";
import { Card, PageHeader, Segmented, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Kind = EndpointResponse<"chainActivity">["data"]["events"][number]["kind"];

const GROUPS: { value: string; label: string; kinds: Kind[] }[] = [
  { value: "all", label: "All activity", kinds: ALL_KINDS },
  { value: "people", label: "People only", kinds: PEOPLE_KINDS },
  { value: "deposit", label: "Deposits", kinds: ["mint", "venue_in"] },
  {
    value: "withdraw",
    label: "Withdrawals",
    kinds: [
      "redeem_request",
      "redeem_fulfilled",
      "redeem_cancelled",
      "propamm_sell",
      "propamm_buy",
      "venue_out",
    ],
  },
  { value: "large", label: "Transfers", kinds: ["large_transfer"] },
  {
    value: "ops",
    label: "Protocol operations",
    kinds: ["price_vector", "market_stats", "admin_config", "vault_move"],
  },
];

const flowsBuild = (d: EndpointResponse<"chainFlows">): ChartSpec => chainFlowsSpec(d);
const DAY_MS = 24 * 3_600_000;
/** The most events the API returns in one answer. */
const WINDOW = 200;

const compact = (n: number): string =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);

/** Every transaction the OnRe program sees, newest first, refreshed every 15 seconds. */
export function ActivityPage() {
  const [group, setGroup] = useState("all");
  const g = GROUPS.find((x) => x.value === group);
  const now = useNow(15_000);
  // The tiles read the newest events of the kinds people produce, not upkeep, so a busy day of price updates cannot push them out.
  const all = useChainActivity({ query: { limit: 1 } });
  const people = useChainActivity({
    query: { limit: WINDOW, kind: PEOPLE_KINDS.join(",") },
  });
  const flows = useChainFlows({ query: { range: "1m" } });

  const stats = useMemo(() => {
    const events = people.data?.data.events ?? [];
    const day = events.filter((e) => now.getTime() - new Date(e.ts).getTime() < DAY_MS);
    // When every returned event is still inside the 24 hours, older ones may exist: the numbers are then a floor.
    const partial = events.length >= WINDOW && day.length === events.length;
    return {
      latest: all.data?.data.events[0]?.ts ?? null,
      day: day.length,
      partial,
      minted: day.reduce((a, e) => a + Math.max(0, e.supplyDelta ?? 0), 0),
      burned: day.reduce((a, e) => a + Math.max(0, -(e.supplyDelta ?? 0)), 0),
      counts: all.data?.data.counts ?? {},
    };
  }, [all.data, people.data, now]);

  const count = (...kinds: Kind[]): number => kinds.reduce((a, k) => a + (stats.counts[k] ?? 0), 0);

  return (
    <>
      <PageHeader eyebrow="Live" title="Deposits, withdrawals and transfers of ONyc" />
      <div className="bento act-stats">
        <Card as="article">
          <Stat
            label="Last transaction"
            value={stats.latest === null ? "—" : formatRelativeAge(stats.latest)}
            note="Read from Solana about once a minute"
          />
        </Card>
        <Card as="article">
          <Stat
            label="Last 24 hours"
            value={`${stats.day}${stats.partial ? "+" : ""}`}
            note="deposits, withdrawals, transfers"
          />
        </Card>
        <Card as="article">
          <Stat
            label="ONyc minted, 24 h"
            value={`${compact(stats.minted)}${stats.partial ? "+" : ""}`}
            note={`${compact(stats.burned)}${stats.partial ? "+" : ""} burned`}
          />
        </Card>
        <Card as="article">
          <Stat
            label="Withdrawals recorded"
            value={String(count("redeem_request", "redeem_fulfilled", "redeem_cancelled"))}
            note={`${count("mint")} deposits recorded`}
          />
        </Card>
      </div>

      <div className="grid">
        <div className="span-8">
          <Card
            title="Transactions"
            subtitle="ONyc going in and out of OnRe and of other protocols such as Kamino, Exponent and Orca, and other ONyc transfers"
            actions={
              <Segmented
                label="Show"
                value={group}
                onChange={setGroup}
                options={GROUPS.map((x) => ({ value: x.value, label: x.label }))}
              />
            }
          >
            <ChainFeed limit={100} {...(g === undefined ? {} : { kinds: g.kinds })} />
          </Card>
        </div>
        <div className="span-4 stack">
          <Panel
            q={flows}
            build={flowsBuild}
            title="Net supply change from transactions"
            span={12}
            height={240}
          />
          <Card title="What is counted" as="article">
            <p className="tone-neutral">
              Every transaction that calls the OnRe program and every transaction that moves ONyc,
              of any size: deposits, withdrawals, moves into and out of Kamino, Exponent, Loopscale,
              Orca and Raydium, and plain transfers. Only transactions that name the ONyc mint are
              seen, and history starts when collection started. The program's own upkeep is included
              under All activity and can be shown alone under Protocol operations. Each row opens
              its details here.
            </p>
            <Provenance meta={all.data?.meta["events"]} />
          </Card>
        </div>
      </div>
    </>
  );
}
