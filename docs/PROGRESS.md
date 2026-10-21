# Progress log

One short report per phase: what was built, what was verified live, what is open. Phases run back to back; each ends with its
checks (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm format:check`) and a commit.

## Phase 0: scaffold (done)

Monorepo (pnpm workspaces, Turborepo, TypeScript, ESLint flat config, Prettier, Vitest), CI workflow, `docker-compose.yml`, `.env.example`,
placeholder packages and five placeholder apps. Docs contradictions resolved and recorded in `docs/DATA_SOURCES.md`.

## Phase 1: data layer (done)

- `packages/sources`: clients and zod schemas for the OnRe core and rewards APIs, the four Google Sheets, Accountable, Jupiter,
  GeckoTerminal and DefiLlama; every endpoint called live and saved as a fixture; 69 parser tests; live contract tests (`pnpm test:live`).
- `packages/db`: Drizzle schema (33 tables) and one migration. Local Postgres 16 runs embedded with `pnpm db:local`; `docker-compose.yml`
  stays for everyone else.
- `apps/worker`: 17 scheduled jobs with per-source circuit breakers, `source_health`, de-duplicated raw snapshots, idempotent events, sheet
  diffing, and an hourly leaderboard crawl. 24 tests.
- Open: the Helius client is unverified (no key); leaderboard storage grows about 1 GB a year.

## Phase 2: metrics and API (done)

- `packages/metrics`: every SPEC formula, including a BigInt port of the on-chain price-vector function (verified: the decoded schedule
  equals the live NAV exactly), and 12 independent risk signals with no blended score. 47 tests.
- `packages/sdk`: the typed `/v1` contract (zod), a validating client, TanStack Query hooks.
- `apps/api`: Hono REST API with 21 routes, SSE stream, OpenAPI 3.1 generated from the contract, TTL cache, rate limiting; every response
  carries per-field `{ source, fetchedAt, stale }`. 31 tests, 20 of them against a real Postgres filled by the worker from fixtures.
- Open: SSE tested at the hub level only; SDK hooks untested; GitHub Actions not yet run; assumed risk thresholds are labelled as such.

## Phase 3: chart system (done)

- Spike of four libraries on real data in two skins; the owner chose Tremor and shadcn/ui charts, so the decision is: shadcn/ui charts
  (Recharts) for Calm, Cobalt and the annotated charts everywhere; Tremor for simple bars in Platinum and Pastel; ECharts for complex
  types in all apps and for all charts in Matrix. ApexCharts is not used. Recorded in `docs/CHARTS.md`.
- `packages/chart-specs` (13 spec kinds, 20 builders, provenance, table, CSV, PNG helpers; 32 tests), `packages/charts-echarts`
  (`makeTheme`, 7 chart kinds, keyboard and reduced-motion layer; 10 tests), and in `apps/web-calm` and `apps/web-platinum` the token
  files, chart frames, adapters and a `/_charts` gallery with 25 panels from the live API.
- Verified in a real browser on both apps (`scripts/verify-charts.mjs`, 9/9 each): source and age footers, keyboard crosshair, table view,
  CSV and PNG export, URL-synced range, no console errors, reduced motion. Phone width has no horizontal overflow.
- Open: Tremor charts have no keyboard crosshair (table view is the path) and Platinum's bundle is about 423 KB gzip; the three other apps get
  their adapters in Phase 5; design-studio slop-check reports "no visual asset" until Phase 4 adds the real pages and the Calm hero.

## Phase 4: web-calm, all 11 pages (done)

- `apps/web-calm`: a Vite and React app with the Calm tokens, a sidebar and phone menu, a footer disclaimer on every page, and the eleven pages of
  SPEC.md: Overview, NAV & Yield (range, log scale, decoded price vector and forward path, returns, calendar, yield composition, benchmarks, projection
  calculator), Peg & Liquidity (market vs NAV, premium bars, pools, redemption offers, capacity limits, flow, public log, exit-cost estimator),
  Reinsurance Book (sortable, searchable layers; Gantt; concentration; risk and return; renewal calendar; history), Capital & DeFi (stack,
  protocol shares over time, reconciliation, looping share, opportunities explorer, tranching), Points (growth, emission, leaderboard with
  search and venue breakdown, Lorenz, venue mix, multipliers), Wallet Lab (address lookup, points, rank, referrals, share card as PNG),
  Risk & Transparency (12 independent signals, reserves tree), Data Health (sources and live conflicts), Activity & Alerts, Developers
  (OpenAPI-driven reference with copyable curl).
- Every number carries its source and age (`Provenance`), stale data is marked, empty history says "collecting since", errors name the source.
- Contract change: `Kpi.changeMode` ("relative" or "absolute") makes the unit of a KPI change explicit; `@onyc/sdk` exports `ALERT_RULES`, the single
  list the Telegram bot (Phase 6) and the Activity page both use. Tests found and fixed two usage lines in it.
- Verified in a real browser: all 12 routes on desktop and phone with no console errors and no horizontal overflow; phone menu behaviour; keyboard
  skip link. See `.design/critique.md` for what was and was not run.
- Open: the Helius-backed on-chain balance shows "not configured"; the MCP section of Developers waits for Phase 6; the 15-line rubric and blind
  critic were not run.
