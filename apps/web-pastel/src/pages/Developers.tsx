import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Card, Notice, PageHeader, Pill } from "../ui/kit";

interface Param {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string; enum?: string[]; default?: unknown };
}
interface Operation {
  summary?: string;
  tags?: string[];
  parameters?: Param[];
}
interface OpenApi {
  info?: { title?: string; version?: string; description?: string };
  paths: Record<string, { get?: Operation }>;
}

const base = (): string => import.meta.env.VITE_API_URL ?? window.location.origin;

function useOpenApi() {
  return useQuery({
    queryKey: ["openapi"],
    queryFn: async (): Promise<OpenApi> => {
      const res = await fetch(`${base()}/v1/openapi.json`);
      if (!res.ok) throw new Error(`The API answered ${res.status}.`);
      return (await res.json()) as OpenApi;
    },
    staleTime: 5 * 60_000,
  });
}

function Curl({ path, params }: { path: string; params: Param[] }) {
  const [done, setDone] = useState(false);
  const example = params.reduce((p, x) => {
    if (x.in === "path")
      return p.replace(
        `{${x.name}}`,
        x.name === "address" ? "DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh" : `<${x.name}>`,
      );
    return p;
  }, path);
  const query = params
    .filter((x) => x.in === "query" && x.required === true)
    .map((x) => `${x.name}=<${x.name}>`);
  const url = `${base()}${example}${query.length > 0 ? `?${query.join("&")}` : ""}`;
  const cmd = `curl -s "${url}"`;
  return (
    <div className="curl">
      <code className="mono">{cmd}</code>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          void navigator.clipboard.writeText(cmd).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
      >
        {done ? (
          <Check size={16} strokeWidth={2} aria-hidden="true" />
        ) : (
          <Copy size={16} strokeWidth={1.75} aria-hidden="true" />
        )}
        <span className="sr-only">Copy the curl command</span>
      </button>
    </div>
  );
}

export function DevelopersPage() {
  const q = useOpenApi();
  const doc = q.data;
  const ops =
    doc === undefined
      ? []
      : Object.entries(doc.paths).flatMap(([path, item]) =>
          item.get === undefined ? [] : [{ path, op: item.get }],
        );
  const tags = [...new Set(ops.flatMap((o) => o.op.tags ?? ["Other"]))];

  return (
    <>
      <PageHeader
        eyebrow="Developers"
        title="Read everything this site shows, from your own code"
        right={<Pill tone="accent">{ops.length} endpoints</Pill>}
      />

      <div className="split">
        <Card
          title="The API"
          subtitle={doc?.info?.version === undefined ? undefined : `Version ${doc.info.version}`}
        >
          <p>
            Every number on this site comes from a read-only JSON API. Responses look like{" "}
            <code className="mono">{"{ data, meta }"}</code>, where{" "}
            <code className="mono">meta</code> gives the source, fetch time and staleness of each
            field. No key is needed; requests are rate limited per address.
          </p>
          <pre className="code">{`curl -s "${base()}/v1/overview"\ncurl -s "${base()}/v1/nav?range=1y"\ncurl -N "${base()}/v1/stream"`}</pre>
          <p>
            <a className="ext" href={`${base()}/v1/openapi.json`}>
              OpenAPI 3.1 document
            </a>
          </p>
        </Card>
        <Card title="Live stream" subtitle="Server-sent events">
          <p>
            <code className="mono">GET /v1/stream</code> keeps a connection open and sends a price
            tick every few seconds and every new event as it is detected. Use it for dashboards and
            bots that should not poll.
          </p>
          <pre className="code">{`const es = new EventSource("${base()}/v1/stream");\nes.addEventListener("tick", (e) => console.log(JSON.parse(e.data)));\nes.addEventListener("event", (e) => console.log(JSON.parse(e.data)));`}</pre>
        </Card>
      </div>

      <Card title="TypeScript client" subtitle="The same package this site uses">
        <p>
          <code className="mono">@onyc/sdk</code> has typed functions and React Query hooks for
          every endpoint, and validates each response against the contract, so a changed upstream
          fails loudly instead of showing a wrong number.
        </p>
        <pre className="code">{`import { createClient } from "@onyc/sdk";\n\nconst api = createClient({ baseUrl: "${base()}" });\nconst { data, meta } = await api.call("nav", { query: { range: "3m" } });\nconsole.log(data.series.at(-1), meta.series.source);`}</pre>
      </Card>

      {q.isError ? (
        <Notice tone="bad">
          The API reference could not be loaded:{" "}
          {q.error instanceof Error ? q.error.message : "unknown error"}.
        </Notice>
      ) : doc === undefined ? (
        <Card>
          <p className="tone-neutral">Loading the reference…</p>
        </Card>
      ) : (
        tags.map((tag) => (
          <Card key={tag} title={tag}>
            <div className="endpoints">
              {ops
                .filter((o) => (o.op.tags ?? ["Other"]).includes(tag))
                .map(({ path, op }) => (
                  <article key={path} className="endpoint">
                    <header>
                      <Pill tone="accent">GET</Pill> <code className="mono">{path}</code>
                    </header>
                    <p>{op.summary}</p>
                    {(op.parameters ?? []).length > 0 && (
                      <ul className="params">
                        {(op.parameters ?? []).map((p) => (
                          <li key={`${p.in}${p.name}`}>
                            <code className="mono">{p.name}</code>{" "}
                            <span className="tone-neutral">
                              {p.in}
                              {p.required === true ? ", required" : ""}
                              {p.schema?.enum !== undefined
                                ? ` · ${p.schema.enum.join(" | ")}`
                                : p.schema?.type !== undefined
                                  ? ` · ${p.schema.type}`
                                  : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <Curl path={path} params={op.parameters ?? []} />
                  </article>
                ))}
            </div>
          </Card>
        ))
      )}

      <Card title="MCP server" subtitle="For AI assistants">
        <p>
          The Model Context Protocol server gives an assistant the same data as tools: {"one"}{" "}
          read-only tool per endpoint, named <code className="mono">get_overview</code>,{" "}
          <code className="mono">get_nav</code>, <code className="mono">get_wallet</code> and so on.
          It cannot write, sign or move anything. Build the repository once, then add the server to
          your assistant's configuration:
        </p>
        <pre className="code">{`{
  "mcpServers": {
    "onyc-terminal": {
      "command": "node",
      "args": ["/path/to/repo/packages/mcp/dist/main.js"],
      "env": { "API_PUBLIC_URL": "${base()}" }
    }
  }
}`}</pre>
        <p className="tone-neutral small">
          Every answer is <code className="mono">{"{ data, meta }"}</code>, so the assistant can
          quote each number's source and age.
        </p>
      </Card>
    </>
  );
}
