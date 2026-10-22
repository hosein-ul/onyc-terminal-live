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

## Phase 5: the other four directions (done)

- `apps/web-platinum`, `web-cobalt`, `web-pastel`, `web-matrix`: each has its own tokens, shell, UI kit, chart adapters and all eleven pages plus its
  `/_charts` gallery where it has one. They share only `@onyc/sdk`, `@onyc/chart-specs`, `@onyc/charts-echarts` and `@onyc/format`; the page code was derived
  from Calm's and then restyled and, where the direction asks, recomposed:
  - **Platinum Rail**: 76 px icon rail with names on hover, breadcrumb header, thin silver numerals (flat fill), progress rings for the two single ratios
    (collateral ratio, liquidity coverage), Tremor for simple bars and bar lists, Recharts for annotated charts.
  - **Cobalt Field**: top navigation, a 220 px NAV numeral as a layout element, filled and outlined capsules, one inverse white card, deep panels; up and down
    shown with ▲ and ▼ and dashed or solid capsules, never red and green.
  - **Pastel Blocks**: wordmark and rounded chips, a headline sentence whose numbers sit in topic-coloured pills, a three-column masonry on Overview;
    colour is topic only (sky NAV and market, mint yield, rose capital and book, lilac points and wallet, butter costs, dark for Developers).
  - **Dot Matrix**: dotted ground, square ink-bordered panels, segmented square navigation, one black "screen" with the NAV in dot-matrix numerals, dashed
    row dividers. Every chart is ECharts: step lines for daily data, square markers, dotted fills, direct labels. This needed `@onyc/charts-echarts` to
    draw time series, stacked areas and bars as well (19 tests now).
- Verified in a real browser on every app: all 12 routes on desktop and on a 390 px touch phone with no console errors, no horizontal overflow and no
  skeleton left on screen (Calm, Platinum, Cobalt, Pastel and Matrix; screenshots in `docs/screens/`). Contrast of text pairs was measured for all five
  (≥ 4.5:1); see `.design/direction.md`.
- Open: the per-page critique (15-line rubric, blind critic) was not run for any app; Cobalt and Matrix chart skins were checked on Overview, NAV and Capital
  only by eye; Pastel's Tremor bar lists use a periwinkle that is lighter than the ink bars in the reference.

## Phase 6: alerts bot, MCP server, deploy notes (done)

- `apps/bot`: Telegram long-polling and webhook delivery without a bot SDK (a thin `fetch` client), the seven rules of `ALERT_RULES`, per-chat rule management
  (`/subscribe`, `/list`, `/unsubscribe`, `/webhook`), delivery that fires each (rule, event) pair once, derived wallet-rank and large-redemption events, SSRF-safe signed
  webhooks. 29 tests, 8 of them end to end over a real Postgres: a simulated peg breach goes through the worker's real evaluator, becomes an event and is delivered to the
  matching chats and webhook only, once.
- `packages/mcp`: a read-only MCP server with 21 tools, one per `/v1` read endpoint; 8 tests through a real MCP client (the server lists its tools and answers `get_overview`
  with the API's own data and sources; bad arguments, unknown tools and API errors come back as sentences). Also run over stdio against the live API.
- `DEPLOY.md` (Neon, three container recipes, five Vercel projects with `vercel.json`, bot setup, MCP configuration, verification and operating notes), a root `README.md`,
  a `Dockerfile` recipe, and favicons and social images for all five apps.
- Found and fixed by these checks: a WIN1252 database could not store the minus sign in event titles (see ARCHITECTURE.md), two usage lines of `ALERT_RULES` whose argument
  count did not match their examples, and a stale API fixture.
- Open: the `Dockerfile` has not been built (no Docker in this environment; the `pnpm deploy` step it relies on was run and the result served `/healthz`); no real Telegram
  message was sent (no token); GitHub Actions has not run; the web apps have no CSP; wallet-rank and redemption rules poll the public API once a minute.

## Phase 7: five pages, a real Overview and a glossary (done, 22 October 2026)

Decisions, in the order they were made:

- **Five pages in every app** (Calm, Cobalt, Matrix, Platinum, Pastel): Overview, Yield & Points, Risk & Reinsurance, Wallet, Alerts & API. The eleven older pages were not
  rewritten; each now sits whole under an anchor of a combined page, so no detail was lost: Yield & Points = NAV & Yield (`#nav`) + Capital & DeFi (`#capital`) + Points
  (`#points`); Risk & Reinsurance = Risk (`#risk`) + Peg & Liquidity (`#market`) + Reinsurance Book (`#reinsurance`) + Data Health with the 7-source check and the collateral
  Sankey moved off the Overview (`#sources`); Alerts & API = Activity (`#activity`) + Developers (`#developers`). The old addresses redirect (`/nav`, `/points`, `/capital`,
  `/market`, `/reinsurance`, `/health`, `/activity`, `/developers`); verified in a browser on all four ported apps. Peg & Liquidity went to Risk because exits are a risk question,
  and Capital & DeFi to Yield because its venues are where yield is chosen.
- **Overview is one long page** with a sticky section bar (anchors Now, Safety, Best places, Points, Flows, Changes, Capital) and a Holder / Hunter / Analyst switch that
  reorders the sections and is remembered in the browser. The shared logic is headless, in the new `@onyc/insights` package (headline sentence, six vitals, safety board,
  best places, points estimates, personas; 17 tests on live fixtures). Each app draws it in its own skin.
- **Headline** is generated from data: NAV behaviour over 30 days, then the biggest concern in a fixed order (30-day outflow of at least 3% of AUM, discount of at least 25 bps,
  solvency report older than 72 h, one protocol holding at least half of capital). Live result: "NAV keeps rising with no down-ticks, but $21.6M left in 30 days".
- **Safety board** uses six of the twelve risk signals with their own limits and sources. Limits are this tool's settings, not OnRe's; state is shown by shape and word as well
  as colour.
- **Best places**: top five venues from OnRe's opportunities sheet, filters Yield, Points, Conservative. Conservative = lending, fixed-rate, protected tranche and managed
  vaults; no leverage and no first-loss share. Venues under $100K of TVL or coming soon are left out. Risk labels are this tool's reading and say so.
- **Points estimate**: OnRe's points page gives the formula (balance x days x 1 point per ONyc per day x venue multiplier x personal multiplier), so the estimate is
  `multiplier / NAV` points per $1 a day, labelled "our estimate" with the formula printed. The global multiplier (0.0001) is shown exactly as reported and marked as not explained
  by OnRe. The daily emission is the latest day of the points history.
- **Glossary**: `@onyc/glossary` holds 33 terms with one plain sentence, why it matters, the basis (stated by OnRe, this tool's method, or general meaning) and a source link.
  Definitions were checked against OnRe's public docs; where the docs do not define a term (price vector, PropAMM, ILW, quota share, per occurrence, aggregate, liquidity layer) the entry
  says so. `docs/GLOSSARY.md` is generated from it (`scripts/gen-glossary.mjs`). In the apps, "?" hints (hover, keyboard, tap) appear on card titles, KPI and stat labels, table
  headers and the Overview text, the first use of a term on the Overview prints a one-line explanation, and `/glossary` lists everything.
- **Fixes from the live Calm site**: (a) two numbers shared the name "liquidity layer coverage": the KPI was the measured balance of collateral flagged liquid (23.7% of AUM) and
  the capital stack was the 15% policy share. They are now "Liquid collateral" (measured) and "Liquidity layer (15% of AUM)" (policy), each explained; (b) the NAV axis started at
  0.9970 because of padding; `TimeSeriesSpec.floor` now stops it at 1.0000 for NAV, in every chart adapter; (c) KPIs with under a week of history say "Collecting history since ..."
  and hide the sparkline; (d) Sankey labels were cut off, the right margin now follows the longest label.
- **Open**: `web-emerald` (a light Warm White and Emerald variant of Calm, added earlier today) keeps the eleven pages and the old Overview; the "?" hints cover the labels
  listed above, not every sentence on the older pages; the combined pages show each old page in full, so Risk & Reinsurance is long; the per-page critique and blind review were not run.

## Phase 8 plan: single frontend, on-chain layer, real visuals (scope change, 22 October 2026)

Scope, by the owner: build only `apps/web-calm`; Cobalt, Dot Matrix, Platinum, Pastel (and the Emerald variant) are cancelled and deleted from the tree (last state in commit ec166f4).
The workspace, turbo pipeline and CI are generic, so they now build one app. Calm is restyled Black + Warm Brand Yellow. Then: A) read-only on-chain layer, B) logos, maps and peril icons.
