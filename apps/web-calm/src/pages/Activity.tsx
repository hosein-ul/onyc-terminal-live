import { formatDateTime, formatRelativeAge } from "@onyc/format";
import { ALERT_RULES } from "@onyc/sdk";
import { useEvents } from "@onyc/sdk/react";
import { useMemo, useState } from "react";
import { Card, Notice, PageHeader, Pill, Segmented, type Tone } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

const SEVERITY: Record<string, Tone> = { info: "neutral", watch: "watch", alert: "bad" };
type Filter = "all" | "market" | "book" | "data";

const GROUP: Record<Filter, (kind: string) => boolean> = {
  all: () => true,
  market: (k) =>
    ["discount_breach", "premium_breach", "nav_", "opportunity_", "collateral_"].some((p) =>
      k.startsWith(p),
    ),
  book: (k) => k.startsWith("layer_"),
  data: (k) => k.startsWith("source_") || k.startsWith("solvency_"),
};

export function ActivityPage() {
  const q = useEvents({ query: { limit: 100 } });
  const [filter, setFilter] = useState<Filter>("all");
  const events = useMemo(
    () => (q.data?.data.events ?? []).filter((e) => GROUP[filter](e.kind)),
    [q.data, filter],
  );

  return (
    <>
      <PageHeader
        eyebrow="Activity & Alerts"
        title="Events and alerts"
      />

      <Card
        title="Events"
        subtitle="Detected by the worker from the data it collects"
        actions={
          <Segmented
            label="Filter events"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "market", label: "Market" },
              { value: "book", label: "Book" },
              { value: "data", label: "Data" },
            ]}
          />
        }
      >
        {q.isError ? (
          <Notice tone="bad">The event feed could not be loaded.</Notice>
        ) : q.data === undefined ? (
          <p className="tone-neutral">Loading…</p>
        ) : events.length === 0 ? (
          <p className="tone-neutral">
            No events in this group. Events appear when the worker sees a change worth noting.
          </p>
        ) : (
          <ul className="feed">
            {events.map((e) => (
              <li key={e.id}>
                <Pill tone={SEVERITY[e.severity] ?? "neutral"}>{e.severity}</Pill>
                <div>
                  <strong>{e.title}</strong>
                  {e.body !== "" && <div>{e.body}</div>}
                  <div className="tone-neutral">
                    {formatRelativeAge(e.ts)} · {formatDateTime(e.ts)} ·{" "}
                    <span className="mono">{e.kind}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Provenance meta={q.data?.meta["events"]} />
      </Card>

      <div className="split">
        <Card title="Telegram alerts" subtitle="Subscribe from a chat with the bot">
          <p>
            Whoever runs this deployment sets up the bot with a Telegram token. Send it these
            commands; each rule is checked against the same events you see above.
          </p>
          <div className="rules">
            {ALERT_RULES.map((r) => (
              <div key={r.key} className="rule">
                <code className="mono">{r.example}</code>
                <p className="small tone-neutral">{r.description}</p>
              </div>
            ))}
          </div>
          <p className="small tone-neutral">
            Other commands: <code className="mono">/list</code> shows your rules,{" "}
            <code className="mono">/unsubscribe &lt;number&gt;</code> removes one,{" "}
            <code className="mono">/help</code> lists everything. If no bot is configured on this
            deployment, nothing is sent.
          </p>
        </Card>
        <Card title="For developers" subtitle="Alerts without Telegram">
          <p>
            The API streams the same events live: <code className="mono">GET /v1/stream</code> is a
            server-sent-events feed of price ticks and events, and{" "}
            <code className="mono">GET /v1/events?kind=…</code> returns the feed as JSON. See the
            Developers page for the full reference.
          </p>
        </Card>
      </div>
    </>
  );
}
