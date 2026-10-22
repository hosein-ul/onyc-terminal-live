# Kickoff prompt — paste this into Claude Code

> Put this whole folder (`CLAUDE.md`, `PROMPT.md`, `docs/`, `design/`) at the root of an empty repo first, then paste the text below.

---

You are building **ONyc Terminal**: an unofficial, community-built, read-only analytics platform for OnRe's ONyc
(tokenized reinsurance on Solana). It has a full backend (ingestion worker, Postgres, REST + SSE API, alerts bot,
MCP server) and **one frontend (Calm)**. The four other directions were cancelled; see docs/PROGRESS.md, Phase 8.

Read `CLAUDE.md` and everything in `docs/` and `design/refs/` before writing code. Those files are the spec.
The data sources in `docs/DATA_SOURCES.md` were verified live on 2026-10-21; re-verify each one before using it.

Build in these phases. Finish each phase completely, run its checks, and report before starting the next.

### Phase 0 — Foundation

- pnpm + Turborepo monorepo exactly as in ARCHITECTURE.md; TypeScript strict; ESLint + Prettier; Vitest.
- `docker-compose.yml` with Postgres 16; `.env.example`; GitHub Actions CI (typecheck, lint, test, build).
- `packages/format` (USD compact, NAV dp, bps, %, dates, relative age).
  **Check:** `pnpm install && pnpm typecheck && pnpm test && pnpm build` all pass on a clean clone.

### Phase 1 — Sources, database, ingestion

- `packages/sources`: one client per source in DATA_SOURCES.md, each with a zod schema built from a saved live fixture, timeout, retry, User-Agent, and a parser for the quirks (string numbers, MM/DD/YYYY dates, space-separated thousands in the reinsurance sheet, subtotal rows in the opportunities sheet, fixed-point vector fields).
- `packages/db`: Drizzle schema from ARCHITECTURE.md + migrations.
- `apps/worker`: every job in the jobs table, idempotent upserts, `raw_snapshots` + `source_health`, sheet diffing into `events`, NAV backfill from 2025-05-28, leaderboard crawl.
- `pnpm test:live` contract tests hitting each real endpoint (opt-in).
  **Check:** run the worker for 15 minutes locally; show row counts per table, `source_health` all green (or explained), the NAV backfill covering 2025-05-28 → today, and one diff event generated from a sheet fixture change.

### Phase 2 — Metrics and API

- `packages/metrics`: every formula in SPEC.md "Metric definitions", unit-tested. Verify the price-vector formula against the onre-sol program source before relying on it, and cite the file/line in a code comment.
- `apps/api`: all `/v1` routes, OpenAPI document, SSE stream, per-metric `meta {source, fetchedAt, stale}`, caching, rate limits.
- `packages/sdk`: typed client + TanStack Query hooks.
  **Check:** OpenAPI validates; every route returns real data from the local DB; tests on fixtures confirm the capital stack sums to AUM (2026-10-21 fixture: 152,722,725 + 87,680,548 + 42,424,107 = 282,827,380) and that conflicts in DATA_SOURCES.md §7 appear in `/v1/health/sources`.

### Phase 3 — Chart system

- **Spike first (about an hour):** in a temporary playground, build the NAV hero chart and the capital stacked-area chart with each candidate library (shadcn/ui charts, Tremor, ApexCharts, ECharts) using real API data and the Calm and Platinum tokens. Screenshot them side by side, decide per app (and per chart type) which libraries to use, freely mixing them as long as each app stays coherent, record the decision in CHARTS.md, and report before continuing. Other libraries (Recharts, Visx, Plot, Nivo, uPlot…) are open to you too.
- `packages/chart-specs` (data shaping, annotations, thresholds, units, source/age footer) and `packages/charts-echarts` (sankey, treemap/icicle, calendar heatmap, Gantt, Lorenz, large scatter; `makeTheme(tokens)`), then each app's `src/charts/` adapter for the libraries you picked for it. Every chart in the catalogue must exist in every app. Do not hand-build what a library already does well, and never ship a library's default theme.
- A `/_charts` gallery route lives in each app; develop against real API data.
  **Check:** gallery shows every chart with real data in two very different skins (Calm and Platinum); keyboard crosshair, table view, PNG/CSV export and reduced-motion all work.

### Phase 4 — First frontend end to end: Calm Fintech

- `apps/web-calm`: all 11 pages from SPEC.md, matching `design/refs/1-calm-fintech.html` and DESIGN.md §1.
- Loading/empty/stale/error states, phone layout, OG share images for Wallet Lab.
  **Check:** screenshot every page at 1440 px and 390 px and compare with the reference; Lighthouse ≥ 90 perf and a11y on Overview; no hard-coded numbers (grep for digits in JSX).

### Phase 5 — The other four directions

- `apps/web-cobalt`, `apps/web-matrix`, `apps/web-platinum`, `apps/web-pastel`, each with all 11 pages, its own layout/nav/components/chart skin per DESIGN.md and its reference file. Same data hooks, different design. Do not reskin Calm; each must read as a different product.
  **Check:** side-by-side screenshots of Overview, Reinsurance Book and Wallet Lab for all five apps.

### Phase 6 — Alerts, MCP, deploy

- `apps/bot` (Telegram) with the rules in SPEC.md §10; webhook delivery.
- `packages/mcp`: read-only MCP server exposing the main `/v1` reads as tools.
- Deploy notes: Neon, API/worker/bot containers, five Vercel projects. Write `DEPLOY.md`.
  **Check:** a test alert fires end to end from a simulated discount breach; MCP server lists tools and answers `get_overview`.

Start with Phase 0. Before coding, reply with: your understanding in ten lines, any contradictions you found in the docs, and the list of sources you'll verify first.
