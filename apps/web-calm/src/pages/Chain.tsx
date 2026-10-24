import { Badge, Named } from "../ui/Badge";
import { chainFlowsSpec, type ChartSpec } from "@onyc/chart-specs";
import {
  formatBps,
  formatCompact,
  formatDateTime,
  formatNav,
  formatNumber,
  formatPercent,
  formatUsdCompact,
} from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useChainFlows, useChainHolders, useChainState } from "@onyc/sdk/react";
import { Panel } from "../charts";
import { shortAddress, signedPct, signedUsd } from "../lib/format";
import { DataTable, type Column } from "../ui/DataTable";
import { ChainFeed, solscanAccount } from "../ui/ChainFeed";
import {
  Card,
  EmptyState,
  ExternalLink,
  Notice,
  PageHeader,
  Pill,
  Skeleton,
  Stat,
} from "../ui/kit";
import { Provenance } from "../ui/Provenance";
import { TermNote } from "../ui/Term";

type State = EndpointResponse<"chainState">["data"];
type HolderRow = EndpointResponse<"chainHolders">["data"]["rows"][number];

const flowsBuild = (d: EndpointResponse<"chainFlows">): ChartSpec => chainFlowsSpec(d);

const PROVIDER_TEXT: Record<State["provider"]["name"], string> = {
  helius: "Helius RPC",
  custom: "a private RPC endpoint",
  public: "the public Solana RPC (rate limited)",
  unknown: "an unknown RPC",
};

/** Read straight from the OnRe program on Solana, next to what the API says. */
export function ChainPage() {
  const state = useChainState();
  const holders = useChainHolders();
  const flows = useChainFlows({ query: { range: "1m" } });
  const s = state.data?.data;
  const h = holders.data?.data;
  const f = flows.data?.data;

  return (
    <>
      <PageHeader
        eyebrow="On chain"
        title="What Solana says about ONyc"
        right={
          s === undefined ? undefined : (
            <Pill tone={s.provider.name === "public" ? "watch" : "good"}>
              {s.provider.name === "helius"
                ? "Helius"
                : s.provider.name === "public"
                  ? "Public RPC"
                  : "Private RPC"}
            </Pill>
          )
        }
      />
      <TermNote id="nav" />
      <p className="lede">
        Everything here is read from the OnRe program's accounts and transactions on Solana,
        read-only, and set next to the numbers the API reports. Where the two differ, both are
        shown.
      </p>
      {s !== undefined && (
        <Notice tone="info" title="Where the data comes from">
          Reading through {PROVIDER_TEXT[s.provider.name]}.{" "}
          {s.provider.heliusConfigured
            ? "A Helius key is configured."
            : "Helius is not configured; set HELIUS_API_KEY on the worker for faster, higher-volume reads."}
        </Notice>
      )}
      {state.isError && (
        <Notice tone="bad" title="The on-chain state could not be loaded">
          Nothing below is invented while it is down.
        </Notice>
      )}

      <div className="grid">
        <div className="span-7">
          <Card
            title="Program numbers against the API"
            subtitle="The program stores its own NAV, APY and TVL"
          >
            {s === undefined ? (
              <Skeleton height={180} />
            ) : s.stats === null ? (
              <EmptyState title="Not collected yet">
                The worker has not read the program yet.
              </EmptyState>
            ) : (
              <table className="mini">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th className="num">On chain</th>
                    <th className="num">API</th>
                    <th className="num">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>NAV</td>
                    <td className="num">{formatNav(s.stats.nav, 6)}</td>
                    <td className="num">{formatNav(s.stats.apiNav, 6)}</td>
                    <td className="num">
                      {s.stats.navDifference === null
                        ? "—"
                        : formatNumber(s.stats.navDifference, 6)}
                    </td>
                  </tr>
                  <tr>
                    <td>APY</td>
                    <td className="num">{formatPercent(s.stats.apy, 2)}</td>
                    <td className="num">{formatPercent(s.stats.apiApy, 2)}</td>
                    <td className="num">
                      {s.stats.apy === null || s.stats.apiApy === null
                        ? "—"
                        : signedPct(s.stats.apy - s.stats.apiApy, 2)}
                    </td>
                  </tr>
                  <tr>
                    <td>TVL / AUM</td>
                    <td className="num">{formatUsdCompact(s.stats.tvlUsd)}</td>
                    <td className="num">{formatUsdCompact(s.stats.apiTvl)}</td>
                    <td className="num">
                      {s.stats.tvlUsd === null || s.stats.apiTvl === null
                        ? "—"
                        : signedUsd(s.stats.tvlUsd - s.stats.apiTvl)}
                    </td>
                  </tr>
                  <tr>
                    <td>Circulating supply</td>
                    <td className="num">{formatCompact(s.stats.circulating)} ONyc</td>
                    <td className="num">—</td>
                    <td className="num">—</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="rule">
              The program refreshes these numbers only when someone calls refresh_market_stats, so
              the on-chain NAV can lag the API by up to one day's step
              {s?.stats?.updatedAt ? ` (refreshed ${formatDateTime(s.stats.updatedAt)})` : ""}. The
              NAV formula was checked against these accounts and reproduces the stored value
              exactly.
            </p>
            {state.data !== undefined && <Provenance meta={state.data.meta["stats"]} />}
          </Card>
        </div>
        <div className="span-5">
          <Card title="Supply" subtitle="Why two supply numbers are both right">
            {s === undefined || s.supply === null ? (
              <Skeleton height={140} />
            ) : (
              <div className="stats">
                <Stat
                  label="Total supply"
                  value={`${formatCompact(s.supply.total)} ONyc`}
                  note="the token mint on chain"
                />
                <Stat
                  label="Circulating"
                  value={`${formatCompact(s.supply.circulating)} ONyc`}
                  note="as the program reports it"
                />
                <Stat
                  label="Excluded"
                  value={`${formatCompact(s.supply.excludedHeld)} ONyc`}
                  note="held by the boss wallet, which the program subtracts"
                />
              </div>
            )}
            {state.data !== undefined && <Provenance meta={state.data.meta["supply"]} />}
          </Card>
        </div>
      </div>

      <Card
        title="Independent solvency check"
        subtitle="What holders are owed at NAV, from the chain, against every other figure"
      >
        {s === undefined ? (
          <Skeleton height={140} />
        ) : (
          <>
            <div className="stats">
              <Stat
                label="Owed at NAV (total supply)"
                value={formatUsdCompact(s.solvency.impliedAumUsd)}
                note={`${formatUsdCompact(s.solvency.impliedCirculatingUsd)} without the boss wallet`}
              />
              <Stat
                label="AUM from the API (circulating)"
                value={formatUsdCompact(s.solvency.apiAumUsd)}
                note={
                  s.solvency.gapApi === null
                    ? ""
                    : `${signedPct(s.solvency.gapApi, 1)} against the chain`
                }
                tone={
                  s.solvency.gapApi !== null && Math.abs(s.solvency.gapApi) >= s.solvency.threshold
                    ? "watch"
                    : "neutral"
                }
              />
              <Stat
                label="Reserves per Accountable"
                value={formatUsdCompact(s.solvency.accountableReservesUsd)}
                note={
                  s.solvency.gapAccountable === null
                    ? ""
                    : `${signedPct(s.solvency.gapAccountable, 1)} against the chain`
                }
              />
              <Stat
                label="Custody visible on chain"
                value={formatUsdCompact(s.solvency.custodyVisibleUsd)}
                note="stablecoins and ONyc in OnRe vaults"
              />
            </div>
            <p className="rule">
              {s.solvency.note} An alert is raised when either gap reaches{" "}
              {formatPercent(s.solvency.threshold, 1)}.
            </p>
            {s.vaults.length > 0 && (
              <table className="mini">
                <thead>
                  <tr>
                    <th>Holder</th>
                    <th>Asset</th>
                    <th className="num">Amount</th>
                    <th className="num">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {s.vaults.map((v) => (
                    <tr key={`${v.holder}-${v.mint}`}>
                      <td>{v.holder}</td>
                      <td>
                        <Named name={v.symbol ?? shortAddress(v.mint)} kind="token" size={18} />
                      </td>
                      <td className="num">{formatCompact(v.amount)}</td>
                      <td className="num">{formatUsdCompact(v.valueUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        {state.data !== undefined && <Provenance meta={state.data.meta["solvency"]} />}
      </Card>

      <div className="grid">
        <div className="span-6">
          <Card
            title="Redemptions on chain"
            subtitle="Read from the program's accounts; this is the primary source, not the partial public log"
          >
            {s === undefined ? (
              <Skeleton height={140} />
            ) : (
              <>
                <div className="stats">
                  <Stat
                    label="Open requests"
                    value={String(s.redemptions.openRequests.length)}
                    note={`${s.redemptions.requestAccounts} request accounts exist`}
                  />
                  <Stat
                    label="Executed in total"
                    value={`${formatCompact(s.redemptions.offers.reduce((a, o) => a + o.executed, 0))} ONyc`}
                    note="across the redemption offers"
                  />
                </div>
                {s.redemptions.openRequests.length === 0 && (
                  <p className="tone-neutral">
                    No redemption request is open: the program closes a request once it is
                    fulfilled.
                  </p>
                )}
                <table className="mini">
                  <thead>
                    <tr>
                      <th>Pays out in</th>
                      <th className="num">Executed</th>
                      <th className="num">Fee</th>
                      <th className="num">PropAMM fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.redemptions.offers.map((o) => (
                      <tr key={o.address}>
                        <td>
                          <Named
                            name={o.tokenOutSymbol ?? shortAddress(o.tokenOut)}
                            kind="token"
                            size={18}
                          />
                          {o.disabled ? " (disabled)" : ""}
                        </td>
                        <td className="num">{formatCompact(o.executed)}</td>
                        <td className="num">{formatBps(o.feeBps)}</td>
                        <td className="num">{formatBps(o.propAmmFeeBps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {state.data !== undefined && <Provenance meta={state.data.meta["redemptions"]} />}
          </Card>
        </div>
        <div className="span-6">
          <Card title="Latest redemptions and sales" subtitle="From program transactions">
            <ChainFeed
              limit={8}
              kinds={["redeem_request", "redeem_fulfilled", "redeem_cancelled", "propamm_sell"]}
            />
          </Card>
        </div>
      </div>

      <div className="grid">
        <Panel
          q={flows}
          build={flowsBuild}
          title="Net supply change from transactions"
          span={7}
          height={260}
        />
        <div className="span-5">
          <Card title="Two views of the same flow" subtitle="This month">
            {f === undefined ? (
              <Skeleton height={120} />
            ) : (
              <>
                <div className="stats">
                  <Stat
                    label="From transactions"
                    value={signedUsd(f.totals.netUsd)}
                    note={`${formatCompact(f.totals.minted)} minted, ${formatCompact(f.totals.burned)} burned`}
                  />
                  <Stat
                    label="API estimate"
                    value={signedUsd(f.apiNetFlowUsd)}
                    note="from daily supply changes"
                  />
                </div>
                <p className="rule">{f.note}</p>
              </>
            )}
            {flows.data !== undefined && <Provenance meta={flows.data.meta["totals"]} />}
          </Card>
        </div>
      </div>

      <Card
        title="Who holds ONyc"
        subtitle={
          h?.holders == null
            ? "Every token account of the mint, summed by owner"
            : `${formatNumber(h.holders, 0)} holders · Gini ${formatNumber(h.gini ?? 0, 3)} · scanned ${h.scanTs === null ? "—" : formatDateTime(h.scanTs)}`
        }
      >
        {h === undefined ? (
          <Skeleton height={220} />
        ) : h.rows.length === 0 ? (
          <EmptyState title="No holder scan yet">The worker scans the mint hourly.</EmptyState>
        ) : (
          <>
            <div className="stats">
              {h.top.map((t) => (
                <Stat
                  key={t.n}
                  label={`Top ${t.n}`}
                  value={formatPercent(t.share, 1)}
                  note="of all ONyc"
                />
              ))}
            </div>
            <DataTable
              caption="Top ONyc holders"
              columns={holderColumns}
              rows={h.rows}
              rowKey={(r) => r.owner}
              pageSize={15}
              initialSort={{ key: "rank", dir: "asc" }}
              search={{
                placeholder: "Search an address or a protocol",
                match: (r, q) =>
                  `${r.owner} ${r.protocol ?? ""} ${r.label ?? ""}`.toLowerCase().includes(q),
              }}
            />
            <p className="rule">{h.note}</p>
          </>
        )}
        {holders.data !== undefined && <Provenance meta={holders.data.meta["rows"]} />}
      </Card>

      {h !== undefined && h.crossCheck.length > 0 && (
        <Card
          title="On-chain holdings against capital by protocol"
          subtitle="ONyc held by each protocol's accounts, at NAV, against what the rewards API reports"
        >
          <table className="mini">
            <thead>
              <tr>
                <th>Protocol</th>
                <th className="num">On chain</th>
                <th className="num">Rewards API</th>
                <th className="num">Difference</th>
              </tr>
            </thead>
            <tbody>
              {h.crossCheck.map((c) => (
                <tr key={c.protocol}>
                  <td>{c.protocol}</td>
                  <td className="num">{formatUsdCompact(c.onchainUsd)}</td>
                  <td className="num">{formatUsdCompact(c.apiUsd)}</td>
                  <td className="num">
                    {c.differencePct === null ? "—" : signedPct(c.differencePct, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rule">
            Only holders this tool can label are counted, so a protocol whose positions sit in
            unlabelled accounts shows less on chain than the API. A match, as for Kamino and
            Exponent, is two independent sources agreeing.
          </p>
          <Provenance meta={holders.data?.meta["crossCheck"]} />
        </Card>
      )}

      <Card
        title="Recent program activity"
        subtitle="Every instruction is named from its data; nothing is signed or sent from here"
      >
        <ChainFeed limit={15} />
      </Card>
    </>
  );
}

const holderColumns: Column<HolderRow>[] = [
  { key: "rank", header: "#", sort: (r) => r.rank, cell: (r) => r.rank, align: "right" },
  {
    key: "owner",
    header: "Holder",
    sort: (r) => r.owner,
    cell: (r) => (
      <span className="holder">
        <ExternalLink href={solscanAccount(r.owner)}>{shortAddress(r.owner)}</ExternalLink>
        {r.label !== null ? (
          <Pill tone="accent">
            {r.protocol !== null && <Badge name={r.protocol} size={16} />}
            {r.label}
          </Pill>
        ) : r.kind === "wallet" ? (
          <span className="tone-neutral">wallet</span>
        ) : r.kind === "program" ? (
          <span className="tone-neutral">program account</span>
        ) : (
          <span className="tone-neutral">unlabelled</span>
        )}
      </span>
    ),
  },
  {
    key: "amount",
    header: "ONyc",
    align: "right",
    sort: (r) => r.amount,
    cell: (r) => formatCompact(r.amount),
  },
  {
    key: "share",
    header: "Share",
    align: "right",
    sort: (r) => r.share,
    cell: (r) => formatPercent(r.share, 2),
  },
  {
    key: "by",
    header: "Label from",
    wide: true,
    sort: (r) => r.labelledBy ?? "",
    cell: (r) =>
      r.labelledBy === null
        ? "—"
        : r.labelledBy === "activity"
          ? "inferred from activity"
          : r.labelledBy === "address"
            ? "known address"
            : "owner program",
  },
];
