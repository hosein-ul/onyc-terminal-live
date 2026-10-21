# ONyc Terminal

An unofficial, community-built, read-only analytics terminal for OnRe's ONyc (tokenized reinsurance on Solana). Not affiliated with
OnRe; not investment advice. It reads public data, shows where every number came from and how old it is, and never asks you to sign or
send anything.

Five separate front ends (Calm Fintech, Cobalt Field, Dot Matrix, Platinum Rail, Pastel Blocks) read one API with the same eleven pages:
Overview, NAV & Yield, Peg & Liquidity, Reinsurance Book, Capital & DeFi, Points, Wallet Lab, Risk & Transparency, Data Health, Activity &
Alerts, Developers.

## Run it on your machine

Needs Node 22 or newer and pnpm 12. No Docker is required.

```bash
pnpm install
cp .env.example .env            # the defaults match the local database below
pnpm db:local                   # terminal 1: an embedded Postgres 16, data in .pgdata/
pnpm db:migrate                 # once
pnpm --filter @onyc/worker dev  # terminal 2: fills the database from the upstream sources (the first full crawl takes a few minutes)
pnpm --filter @onyc/api dev     # terminal 3: the API on http://localhost:4000
pnpm --filter @onyc/web-calm dev   # terminal 4: http://localhost:5173 (the other apps: web-cobalt, web-matrix, web-platinum, web-pastel)
```

Each app proxies `/v1` to the API, so no variable is needed locally. Every chart type is on `/_charts` in Calm and Platinum.

Optional: `HELIUS_API_KEY` turns on on-chain balances; `TELEGRAM_BOT_TOKEN` and `pnpm --filter @onyc/bot dev` start the alerts bot.
Without them those features say "not configured".

## Layout

| Path                                              | What                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/worker`                                     | polls the upstream sources, writes data and events                              |
| `apps/api`                                        | the `/v1` API, SSE stream, OpenAPI                                              |
| `apps/bot`                                        | Telegram and webhook alerts                                                     |
| `apps/web-*`                                      | the five front ends                                                             |
| `packages/sources`                                | clients and zod schemas for every upstream, tested on saved live responses      |
| `packages/metrics`                                | every formula (NAV schedule, returns, attribution, concentration, risk signals) |
| `packages/db`                                     | Drizzle schema and migration                                                    |
| `packages/sdk`                                    | the typed `/v1` contract, client and React hooks                                |
| `packages/chart-specs`, `packages/charts-echarts` | library-agnostic chart data and the ECharts layer                               |
| `packages/format`                                 | number, date and age formatting                                                 |
| `packages/mcp`                                    | read-only MCP server                                                            |

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm format:check
pnpm test:live          # opt in: contract tests against the real upstreams
node scripts/verify-charts.mjs http://localhost:5173   # browser checks of a chart gallery
```

Tests that need a database (`api`, `bot`) use `DATABASE_URL` from `.env` and skip when it is unreachable.

## Read next

`docs/SPEC.md` (what each page contains and every formula), `docs/DATA_SOURCES.md` (verified endpoints and known conflicts between
sources), `docs/ARCHITECTURE.md`, `docs/CHARTS.md`, `docs/DESIGN.md`, `docs/PROGRESS.md` (what each phase built and verified) and
`DEPLOY.md`.
