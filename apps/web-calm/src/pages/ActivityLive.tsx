import { chainFlowsSpec, type ChartSpec } from "@onyc/chart-specs";
import { formatRelativeAge } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useChainActivity, useChainFlows } from "@onyc/sdk/react";
import { useMemo, useState } from "react";
import { Panel } from "../charts";
import { useNow } from "../lib/useNow";
import { ChainFeed, KIND_LABEL } from "../ui/ChainFeed";
import { Card, PageHeader, Segmented, Stat } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Kind = EndpointResponse<"chainActivity">["data"]["events"][number]["kind"];

const GROUPS: { value: string; label: string; kinds?: Kind[] }[] = [
  { value: "all", label: "All" },
  { value: "mint", label: "Mints", kinds: ["mint"] },
  {
    value: "redeem",
    label: "Redemptions",
    kinds: [
      "redeem_request",
      "redeem_fulfilled",
      "redeem_cancelled",
      "propamm_sell",
      "propamm_buy",
    ],
  },
  { value: "price", label: "Price", kinds: ["price_vector", "market_stats"] },
  { value: "config", label: "Configuration", kinds: ["admin_config", "vault_move"] },
  { value: "large", label: "Large transfers", kinds: ["large_transfer"] },
];

const flowsBuild = (d: EndpointResponse<"chainFlows">): ChartSpec => chainFlowsSpec(d);
const DAY_MS = 24 * 3_600_000;

const compact = (n: number): string =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);

/** Every transaction the OnRe program sees, newest first, refreshed every 15 seconds. */
export function ActivityPage() {
  const [group, setGroup] = useState("all");
  const g = GROUPS.find((x) => x.value === group);
  const now = useNow(15_000);
  // A wide window feeds the tiles above the list; the list below asks for its own filter.
  const all = useChainActivity({ query: { limit: 200 } });
  const flows = useChainFlows({ query: { range: "1m" } });

  const stats = useMemo(() => {
    const events = all.data?.data.events ?? [];
    const day = events.filter((e) => now.getTime() - new Date(e.ts).getTime() < DAY_MS);
    return {
      latest: events[0]?.ts ?? null,
      day: day.length,
      minted: day.reduce((a, e) => a + Math.max(0, e.supplyDelta ?? 0), 0),
      burned: day.reduce((a, e) => a + Math.max(0, -(e.supplyDelta ?? 0)), 0),
      counts: all.data?.data.counts ?? {},
    };
  }, [all.data, now]);

  const count = (...kinds: Kind[]): number => kinds.reduce((a, k) => a + (stats.counts[k] ?? 0), 0);

  return (
    <>
      <PageHeader eyebrow="Live" title="Every transaction of the OnRe program, as it happens" />
      <div className="bento act-stats">
        <Card as="article">
          <Stat
            label="Last transaction"
            value={stats.latest === null ? "—" : formatRelativeAge(stats.latest)}
            note="Read from Solana about once a minute"
          />
        </Card>
        <Card as="article">
          <Stat label="Last 24 hours" value={String(stats.day)} note="transactions recorded" />
        </Card>
        <Card as="article">
          <Stat
            label="ONyc minted, 24 h"
            value={compact(stats.minted)}
            note={`${compact(stats.burned)} burned`}
          />
        </Card>
        <Card as="article">
          <Stat
            label="Redemptions recorded"
            value={String(count("redeem_request", "redeem_fulfilled", "redeem_cancelled"))}
            note={`${count("mint")} mints, ${count("price_vector")} price updates`}
          />
        </Card>
      </div>

      <div className="grid">
        <div className="span-8">
          <Card
            title="Transactions"
            subtitle="Mints, redemptions, price changes and configuration of the program, and ONyc transfers of 100,000 or more"
            actions={
              <Segmented
                label="Show"
                value={group}
                onChange={setGroup}
                options={GROUPS.map((x) => ({ value: x.value, label: x.label }))}
              />
            }
          >
            <ChainFeed limit={100} {...(g?.kinds === undefined ? {} : { kinds: g.kinds })} />
          </Card>
        </div>
        <div className="span-4 stack">
          <Panel
            q={flows}
            build={flowsBuild}
            title="Net flow from transactions"
            span={12}
            height={240}
          />
          <Card title="What is counted" as="article">
            <p className="tone-neutral">
              Every transaction that calls the OnRe program, classified from its instruction data,
              plus transfers of 100,000 ONyc or more. Each row links to Solscan. Kinds:{" "}
              {Object.values(KIND_LABEL).join(", ")}.
            </p>
            <Provenance meta={all.data?.meta["events"]} />
          </Card>
        </div>
      </div>
    </>
  );
}
