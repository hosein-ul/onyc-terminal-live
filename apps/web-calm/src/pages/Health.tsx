import { formatDateTime, formatRelativeAge } from "@onyc/format";
import type { EndpointResponse } from "@onyc/sdk";
import { useSourceHealth } from "@onyc/sdk/react";
import { DataTable, type Column } from "../ui/DataTable";
import { Card, Notice, PageHeader, Pill, type Tone } from "../ui/kit";
import { Provenance } from "../ui/Provenance";

type Row = EndpointResponse<"healthSources">["data"]["sources"][number];
type Conflict = EndpointResponse<"healthSources">["data"]["conflicts"][number];

const STATUS: Record<Row["status"], Tone> = {
  ok: "good",
  degraded: "watch",
  down: "bad",
  not_configured: "neutral",
};
const STATE: Record<Conflict["state"], { tone: Tone; word: string }> = {
  conflict: { tone: "bad", word: "Conflict now" },
  consistent: { tone: "good", word: "Consistent" },
  note: { tone: "accent", word: "For context" },
  unavailable: { tone: "neutral", word: "Cannot check" },
};

const columns: Column<Row>[] = [
  {
    key: "source",
    header: "Source",
    sort: (r) => r.source,
    cell: (r) => <strong>{r.source}</strong>,
  },
  {
    key: "endpoint",
    header: "Endpoint",
    wide: true,
    sort: (r) => r.endpoint,
    cell: (r) => <span className="mono">{r.endpoint}</span>,
  },
  {
    key: "status",
    header: "Status",
    sort: (r) => r.status,
    cell: (r) => <Pill tone={STATUS[r.status]}>{r.status.replace("_", " ")}</Pill>,
  },
  {
    key: "ok",
    header: "Last success",
    align: "right",
    sort: (r) => r.lastOkAt,
    cell: (r) => (r.lastOkAt === null ? "never" : formatRelativeAge(r.lastOkAt)),
  },
  {
    key: "lat",
    header: "Latency",
    align: "right",
    wide: true,
    sort: (r) => r.lastLatencyMs,
    cell: (r) => (r.lastLatencyMs === null ? "—" : `${r.lastLatencyMs} ms`),
  },
  {
    key: "fail",
    header: "Failures in a row",
    align: "right",
    wide: true,
    sort: (r) => r.consecutiveFailures,
    cell: (r) => r.consecutiveFailures,
  },
];

function ConflictCard({ c }: { c: Conflict }) {
  const s = STATE[c.state];
  return (
    <article className="conflict">
      <header>
        <h3>
          <span className="conflict-no">{c.id}</span> {c.title}
        </h3>
        <div className="conflict-pills">
          <Pill tone={s.tone}>{s.word}</Pill>
          <Pill tone="neutral">
            {c.kind === "computed" ? "Computed live" : "Dated observation"}
          </Pill>
        </div>
      </header>
      <p>{c.detail}</p>
      {Object.keys(c.values).length > 0 && (
        <dl className="kv">
          {Object.entries(c.values).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>
                {v === null
                  ? "—"
                  : typeof v === "number"
                    ? v.toLocaleString("en-US", { maximumFractionDigits: 4 })
                    : v}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {c.observedAt !== null && (
        <p className="prov">Observed {formatDateTime(c.observedAt)}; it cannot be recomputed.</p>
      )}
    </article>
  );
}

export function HealthPage() {
  const q = useSourceHealth();
  const d = q.data?.data;
  const conflicts = d?.conflicts.filter((c) => c.state === "conflict").length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Data Health"
        title="The data behind ONyc Terminal"
        right={
          d !== undefined ? (
            <Pill tone={conflicts > 0 ? "watch" : "good"}>{conflicts} live conflicts</Pill>
          ) : undefined
        }
      />

      <Card title="Sources" subtitle="Every upstream this site reads, and how it is doing">
        {d === undefined ? (
          <p className="tone-neutral">{q.isError ? "Health could not be loaded." : "Loading…"}</p>
        ) : (
          <>
            <DataTable
              caption="Data sources"
              columns={columns}
              rows={d.sources}
              rowKey={(r) => `${r.source}${r.endpoint}`}
              initialSort={{ key: "status", dir: "desc" }}
            />
            {d.sources.some((s) => s.lastError !== null) && (
              <Notice tone="watch" title="Most recent errors">
                <ul className="links">
                  {d.sources
                    .filter((s) => s.lastError !== null)
                    .slice(0, 5)
                    .map((s) => (
                      <li key={`${s.source}${s.endpoint}`}>
                        <strong>{s.source}</strong> {s.endpoint}: {s.lastError}
                      </li>
                    ))}
                </ul>
              </Notice>
            )}
            <Provenance meta={q.data?.meta["sources"]} />
          </>
        )}
      </Card>

      <h2 className="section-title">Where sources disagree</h2>
      <Notice tone="info">
        These are real differences between published figures, kept here so nobody has to wonder.
        Computed ones are recalculated from stored data on every load; dated observations are things
        seen once that cannot be recomputed.
      </Notice>
      <div className="conflicts">
        {d?.conflicts.map((c) => (
          <ConflictCard key={c.id} c={c} />
        ))}
      </div>
      {q.data !== undefined && <Provenance meta={q.data.meta["conflicts"]} />}
    </>
  );
}
