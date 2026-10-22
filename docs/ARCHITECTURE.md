# Architecture

## Monorepo

pnpm workspaces + Turborepo, TypeScript strict everywhere, Node 22.

```
onyc-terminal/
├─ apps/
│  ├─ api/              Hono on Node. REST /v1, SSE /v1/stream, OpenAPI at /v1/openapi.json
│  ├─ worker/           ingestion scheduler (croner) + backfills + alert evaluator
│  ├─ bot/              Telegram alerts bot (grammY)
│  └─ web-calm/         Vite + React, the only front end
├─ packages/
│  ├─ sources/          one client per upstream source + zod schemas + fixtures
│  ├─ db/               Drizzle schema, migrations, query helpers
│  ├─ metrics/          pure functions for every derived number (fully unit-tested)
│  ├─ sdk/              typed client for /v1 + TanStack Query hooks (shared by all 5 web apps)
│  ├─ chart-specs/      chart data + annotations + units, library-agnostic (see CHARTS.md)
│  ├─ charts-echarts/   ECharts layer for complex chart types, themed per app via makeTheme(tokens)
│  ├─ format/           number/currency/bps/date formatting, one place
│  └─ mcp/              MCP server exposing read-only tools over /v1 (last phase)
├─ docker-compose.yml   Postgres 16 (+ optional Redis) for local dev
└─ .env.example
```

The five web apps share `sdk`, `chart-specs`, `charts-echarts`, `format`. Each app also picks its own chart libraries (any mix, see CHARTS.md) wrapped in `src/charts/`. Each app owns its own layout, navigation, components,
typography and chart skin. They must not share a component library beyond those packages; the point is
five real directions, not five color swaps.

## Data flow

```
upstream sources ──► worker (fetch → validate with zod → normalize → upsert) ──► Postgres
                                   │                                    │
                                   └──► source_health / raw_snapshots    └──► api (/v1, cached) ──► 5 web apps
                                                                           └──► SSE live ticks
worker alert evaluator ──► alerts table ──► bot (Telegram) + webhooks
```

- The browser never calls OnRe or third parties directly. Everything goes through `/v1`.
- Every API response carries `meta: { source, fetchedAt, stale: boolean }` per metric, so every chart can print its source and age.

## Database (Drizzle, Postgres; Neon in prod)

Keep raw and derived separate.

- `raw_snapshots(id, source, endpoint, fetched_at, status, payload jsonb, hash)` — every fetch, dedup by hash. Retention: keep all for sheets/solvency, 30 days for 60 s ticks.
- `source_health(source, last_ok_at, last_error_at, last_error, consecutive_failures, status)`
- `live_ticks(ts, nav, apy, tvl, market_price, premium_bps)` — 60 s
- `nav_daily(date pk, nav, aum, circulating_supply, apy_reported)` — from /data/nav with the sheet as cross-check
- `price_vectors(offer, start_time, base_time, base_price, apr, price_fix_duration, state, first_seen)`
- `mint_offers`, `redemption_offers_snap(ts, offer, executed, requested, fee_bps, prop_amm_fee_bps)`, `redemption_settings_snap`
- `protocol_aum_daily(date, protocol, aum_usd, delta_usd, delta_pct)`
- `capital_distribution_snap(ts, protocol, capital_usd, share)`, `reconciliation_snap(ts, …)`
- `points_growth_daily(date, base, referral, total, daily_base, daily_referral, daily_total)`
- `leaderboard_snap(date, rank, address, total_points, breakdown jsonb)` + `wallet_points_cache`
- `reinsurance_layers(layer_id, status, inception, renewal, perils, structure, capital, premium, expected_loss, expected_yield, first_seen, last_seen)` + `reinsurance_layers_history`
- `collateral_assets_snap(ts, asset, amount_usd, allocation, apy, liquidity_layer)`
- `defi_opportunities_snap(ts, classification, protocol, strategy, assets, apy, tvl, reward, link, flags)`
- `solvency_snap(ts, collateralization, reserves_usd, supply_usd, retrieved_at, merkle_root, venues jsonb)`
- `market_pools_snap(ts, pool, dex, price, liquidity, volume_24h)`
- `llama_tvl_daily(date, tvl)`, `llama_pools_snap(ts, pool, project, apy, tvl)`
- `chain_snap(ts, supply, holders, top_holders jsonb, custody_balances jsonb)` (Helius)
- `events(ts, kind, severity, title, body, data jsonb)` — activity feed: NAV step, layer bound, opportunity added, solvency stale, discount breach …
- `alert_rules`, `alert_deliveries`

## Worker jobs

| Job | Cadence | Notes |
|---|---|---|
| live (nav/apy/tvl + Jupiter price) | 60 s | write `live_ticks`, push SSE |
| nav history | 1 h | upsert `nav_daily`; first run backfills from 2025-05-28 |
| offers + vectors | 5 min | new vector ⇒ `events` "NAV re-priced" |
| redemption offers/settings | 5 min | deltas of executed volume ⇒ redemption flow series |
| settings | 15 min | supply + sUSDe benchmark |
| rewards analytics | 1–6 h | aum growth, distribution, reconciliation, points growth |
| leaderboard full crawl | daily 00:30 UTC | polite: ≤ 5 req/s, retry with backoff |
| sheets (4 gids) | 30 min | diff ⇒ `events` |
| solvency | 15 min | staleness check |
| GeckoTerminal pools | 5 min | respect rate limit |
| DefiLlama protocol + yields | 1 h | |
| Helius chain snapshot | 15 min | needs `HELIUS_API_KEY`; skip gracefully if missing |
| alert evaluator | 60 s | |

All jobs: timeout, retry with jitter, circuit breaker per source, structured logs (pino), idempotent upserts.

## API (`/v1`)

Read-only, JSON, cached (in-memory LRU + `Cache-Control`), rate-limited per IP.

```
GET /v1/overview                      KPI bundle for the home screen
GET /v1/nav?range=1w|1m|3m|1y|all     daily NAV, AUM, supply, derived returns
GET /v1/nav/vectors                   decoded price schedule + forward path
GET /v1/flows?range=                  supply change, net mint/burn, AUM attribution (price vs flow)
GET /v1/market                        market price, premium/discount history, pools, liquidity
GET /v1/redemptions                   offers, fees, executed/requested series, capacity settings
GET /v1/reinsurance/layers            book with derived fields
GET /v1/reinsurance/summary           by peril, region, structure, vintage; expiry calendar
GET /v1/yield/composition             collateral assets + reinsurance, blended APY check
GET /v1/capital/stack                 bound / offered / available / liquidity layer / AUM
GET /v1/capital/distribution          by protocol, now + history
GET /v1/capital/reconciliation
GET /v1/defi/opportunities            current + history per opportunity
GET /v1/points/growth
GET /v1/points/leaderboard?page=&size=&q=
GET /v1/points/concentration          Lorenz, Gini, top-N shares, rank movement
GET /v1/wallet/:address               points, breakdown, rank percentile, referrals, onchain balance
GET /v1/solvency
GET /v1/risk                          composite risk panel (see SPEC.md)
GET /v1/health/sources                source_health + cross-source conflicts
GET /v1/events?kind=&limit=           activity feed
GET /v1/stream                        SSE: live ticks + new events
```

## Config

`.env.example`: `DATABASE_URL`, `HELIUS_API_KEY`, `REDIS_URL` (optional), `TELEGRAM_BOT_TOKEN`, `API_PUBLIC_URL`,
`NEXT_PUBLIC_API_URL`, `LOG_LEVEL`. Never commit secrets. The app works without Helius and Telegram; those
features show a clear "not configured" state.

## Deploy

- Postgres: Neon. API + worker + bot: one container each (Fly.io or Railway). Web apps: Vercel, one project per direction.
- CI: GitHub Actions — typecheck, lint, unit tests (metrics + parsers on fixtures), build all apps.

## Quality bar

- Unit tests for every function in `packages/metrics` and every parser in `packages/sources` (run on saved fixtures).
- A contract test per source that hits the live endpoint (separate, opt-in `pnpm test:live`).
- Lighthouse ≥ 90 performance/accessibility on each web app's home page.
- No `any`. No unhandled promise. No silent catch.

## Phase 1 implementation notes

Decisions made while building the worker, where the sections above left room:

- **Local Postgres without Docker:** `pnpm db:local` starts an embedded Postgres 16 (data in `.pgdata/`) with the same credentials as `docker-compose.yml`, so `.env.example` works for both.
- **`source_health` is keyed by (source, endpoint)**, so one failing endpoint degrades its source without hiding the others. A source's status is the worst of its endpoints.
- **Circuit breaker per source:** five consecutive transport failures (network, timeout, 5xx, 429) skip that source for 1 minute, doubling up to 10. Schema and parse errors degrade an endpoint but never open the breaker.
- **`raw_snapshots`:** an identical consecutive payload is folded into the previous row (`seen_count`, `last_seen_at`). Raw payloads are not kept for the 60 s live tick, GeckoTerminal pools or leaderboard pages (their values are in typed tables). Retention: 30 days for everything except `onre-sheets` and `accountable`, which are kept.
- **Derived snapshot tables** (`settings_snap`, `redemption_*_snap`, `solvency_snap`, `collateral_*`) are written when the content changes; time series (`live_ticks`, `market_pools_snap`, `llama_pools_snap`) are written every run.
- **Leaderboard storage:** every wallet gets (date, rank, total points) daily; the full venue breakdown is kept for the top 1,000 (`LEADERBOARD_BREAKDOWN_TOP`). Per-venue totals over all wallets go to `leaderboard_venue_daily`, so the venue mix needs no per-wallet breakdown. An extra job refreshes the top 500 hourly into `leaderboard_top_snap` (30-day retention). At about 24,750 wallets a day the totals alone grow roughly 1 GB a year; revisit before running on a small Neon plan.
- **`redemption_requests` is keyed by the request PDA**, because the log's own `id` repeats.
- **Events are idempotent** through `events.dedup_key`. Historical facts carry their own timestamp (for example a price vector's start time).
- **Our thresholds** (discount 50 bps, solvency stale 24 h, opportunity APY event 50 bps) are environment settings, not data, and live in `apps/worker/src/config.ts`.

## Phase 6 implementation notes

- **Alert rules live in `@onyc/sdk` (`ALERT_RULES`)**: one list used by the bot to parse commands and by the Activity pages to document them. A test checks that
  every example parses and every usage line has the same number of arguments as its example.
- **Delivery is event-driven.** The worker only records facts as `events`; the bot matches them against `alert_rules` and sends. `alert_deliveries` has a
  unique index on `(rule_id, event_id)` and the row is written before the send, so a restart or a second bot process cannot send an alert twice. A rule only sees
  events from after it was created. Failed and skipped sends are recorded with a short reason and are not retried.
- **Two rule kinds have no worker event**: a wallet's rank and a large redemption. The bot derives them from the public API once a minute and writes them as ordinary
  events, with the same dedup guarantee.
- **Webhooks** are registered from Telegram, https only, no credentials, port 443, host must resolve only to public addresses at delivery, redirects not followed,
  bodies signed with HMAC-SHA256 when a secret is set.
- **MCP**: `packages/mcp` builds one tool per entry of the SDK's `endpoints` map (names in `TOOL_NAMES`), takes its input schema from the same zod objects the API
  validates with, and calls the API through the SDK client, so a tool cannot return a shape the contract does not allow.
- **Database encoding**: a Postgres cluster created on Windows with defaults is WIN1252 and cannot store the true minus sign (U+2212) that the formatters put in event
  titles. The bot's end-to-end test found it (an event insert failed). `pnpm db:local` now creates a UTF-8 cluster, `pnpm db:utf8` recreates an old local database, and the
  integration tests create their databases with `encoding 'UTF8'`.
- **Fixtures follow the contract**: the saved API responses in `packages/chart-specs/fixtures` are real, so when the contract changed (`Kpi.changeMode`) the MCP test, which
  validates responses through the SDK, failed until the overview fixture was refreshed from the running API.
