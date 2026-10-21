# Product spec — ONyc Terminal

An unofficial, community-built, read-only analytics terminal for OnRe's ONyc (tokenized reinsurance on Solana).
Audience: ONyc holders, DeFi users looping/lending ONyc, researchers, risk teams.
Job: show what ONyc is worth, where its yield comes from, where the capital sits, what could go wrong — with every number traceable to its source.

Hard rules

- Read-only. No transactions, no wallet signing. "Deposit" buttons link out to app.onre.finance or the partner protocol.
- Footer on every page: "Unofficial community tool. Not affiliated with OnRe. Not investment advice."
- Every number shows its source and age on hover or in a footnote. Stale data is visibly stale.
- Wallet features work from a pasted address. Wallet connect is optional (read the address only).

## Information architecture (same in all 5 apps)

1. **Overview** — the morning view
2. **NAV & Yield**
3. **Peg & Liquidity**
4. **Reinsurance Book**
5. **Capital & DeFi Map**
6. **Points & Leaderboard**
7. **Wallet Lab** (`/wallet/[address]`)
8. **Risk & Transparency**
9. **Data Health**
10. **Activity & Alerts**
11. **Developers** (API docs from OpenAPI, MCP instructions)

## Pages and what they must contain

### 1. Overview

- KPI strip: NAV, live APY, AUM, circulating supply, market premium/discount (bps), collateral ratio, liquidity layer coverage. Each with a 30-day sparkline and change.
- NAV hero chart with event markers (re-pricings, down-ticks).
- "What changed since yesterday": AUM attribution waterfall (NAV effect vs net flows), new events from the feed.
- Capital snapshot: stack bar (bound / available / liquidity layer) + protocol distribution donut-free alternative (see CHARTS.md).
- Source-check widget (AUM per source + spread).

### 2. NAV & Yield

- NAV history with range control (1W 1M 3M 1Y ALL), log/linear toggle, event markers.
- Decoded price schedule: current vector, APR, next re-pricing, forward NAV path for 30/90 days (clearly labelled "scheduled, not guaranteed").
- Return table: 7d, 30d, 90d, YTD, since inception — NAV-implied annualized (compounded) vs reported APY.
- Daily increment calendar heatmap (ppm/day) — makes steps and down-ticks obvious.
- Smoothness: stdev of daily return, max drawdown (should be ~0; show it anyway), count of negative days.
- Yield composition: reinsurance vs collateral assets with each asset's amount and APY; blended APY recomputed and compared to reported 11.02%.
- Benchmark lines: sUSDe APY from settings (note the unit), T-bill rate from the collateral sheet.
- Calculator: amount + horizon → projected value using the current vector (labelled projection).

### 3. Peg & Liquidity

- Market price (Jupiter) vs NAV; premium/discount in bps over time with ±25/50/100 bps bands.
- DEX pools table (GeckoTerminal): pool, DEX, price, liquidity, 24h volume, price change.
- Redemption panel: request fee 25 bps, PropAMM sell fee per offer, executed vs requested per offer, redemption flow series from deltas, capacity settings (initial 3.25M, max 12M, growth rate, 18.5% max share per request, 24 h cooldown).
  - The exact capacity formula is not public in the API. If the IDL or docs define it, implement it with a citation. If not, show the parameters only. Do not invent a curve.
- Redemption feed: from the public `/redemption/requests` log (wallet, amount, fulfilled, time, tx links). It is a partial log (50 rows on 2026-10-21, newest 2026-09-10) that does not reconcile with `executedRedemptions`; show both numbers with that caveat and never present the log's sum as total redemptions.
- Liquidity layer coverage = liquidity layer USD / AUM (target 15%).
- Exit cost estimator: "redeem X ONyc" → fee via request vs PropAMM fee, NAV value, market value. Label as estimate.

### 4. Reinsurance Book

- Table of all layers with sort/filter: perils, structure, status, inception, renewal, capital, net premium, expected loss, expected yield.
- Derived per layer: premium/EL multiple, premium/capital (rate on capital), months to renewal.
- Exposure timeline (Gantt): every layer from inception to renewal, colored by structure, today line.
- Concentration: capital by peril family (US wind, Japan, worldwide, multi-region, Australia, NA+NZ…) and by structure (ILW, per-occurrence, aggregate, quota share). Parse perils into region and peril tags with an explicit mapping table in code.
- Risk/return scatter: expected yield (y) vs expected loss ratio (x), bubble = capital.
- Renewal calendar: capital rolling off per month — shows when the book reprices.
- Book totals: weighted expected yield, total premium, total expected loss, capital bound vs AUM.
- History: when each layer first appeared (from sheet diffs), status changes.

### 5. Capital & DeFi Map

- Capital stack (bound / offered / available / liquidity layer = AUM), with the sum check shown.
- Capital by protocol now and over time (stacked area from `/analytics/aum/growth`, 7 series).
- Reconciliation: circulating vs known custody vs attributed vs unexplained; flag the orca = residual issue.
- Opportunities explorer: all opportunities with classification, protocol, assets, APY, TVL, points multiplier, link. Scatter APY vs TVL (log x). History of APY/TVL per opportunity from snapshots.
- Dependency view: share of ONyc capital in looping strategies (Kamino + Loopscale) — the systemic exposure if a lending market breaks.
- Tranching: senior (srONyc) vs junior (jrONyc) on Exponent: TVL, APY, points boost, and the spread between the two, from the opportunities sheet. Principal-token (PT) rows are shown separately.

### 6. Points & Leaderboard

- Total points issued over time, daily emission (base vs referral).
- Leaderboard with search, rank movement (OnRe's own `rankChange` field, labelled "per OnRe", plus our own 1d/7d/30d movement from daily snapshots), breakdown by venue for each row (expandable). Show the active global multiplier from `activeMultipliers` with the note that OnRe does not explain it.
- Concentration: Lorenz curve, Gini, top 10/100/1000 share, wallets above thresholds.
- Venue mix: share of all points earned per venue (from the crawl).
- Multipliers reference (from the opportunities sheet `reward` column, not hard-coded).

### 7. Wallet Lab `/wallet/[address]`

- Points total, rank, percentile, breakdown by venue (bar), referral stats.
- Onchain ONyc balance and value (Helius), position estimate per venue where the breakdown allows.
- Projected points per day at current composition (only if derivable from data; otherwise omit).
- Shareable card image (OG image route) with the wallet's rank and points.

### 8. Risk & Transparency

A panel of independent signals, each with state (ok / watch / alert), value, threshold, source, age:

- Market discount vs NAV
- Liquidity layer coverage vs 15% target
- Solvency: collateral ratio and retrieval age (Accountable)
- Capital concentration: top protocol share (Kamino ~55%)
- Looping share of capital
- Reinsurance concentration: top peril family share of bound capital
- Supply trend: 30-day change in circulating supply
- Data divergence: max spread between AUM sources
- NAV anomalies: any down-tick or unscheduled step in the last 30 days
- AUM derived vs reported: our AUM from APIs vs the figure derived from bound capital (see DATA_SOURCES §7, conflict 7)
- Layers past renewal: count and capital of `Bound` layers whose renewal month has passed (conflict 8)
  No single blended "risk score" unless its formula is shown in full on the page.
  Links: Allez risk assessment, attestations, audits, BMA register, Solscan program page.
  Reserves by venue from Accountable (venue → asset tree).

### 9. Data Health

Every source with status, last success, last error, latency; and the conflict list from DATA_SOURCES.md §7, computed live.

### 10. Activity & Alerts

- Feed from `events`.
- Telegram bot: `/subscribe discount 50` style commands, per-user rules for: discount bps, NAV down-tick, new layer bound, opportunity APY change, solvency stale, wallet rank change, large redemption flow.
- Webhook alerts for developers.

### 11. Developers

Rendered OpenAPI docs, copyable curl examples, MCP server setup instructions.

## Metric definitions (implement in `packages/metrics`, unit-test each)

- `navReturn(t0,t1) = nav1/nav0 − 1`; annualized = `(1+r)^(365/days) − 1`.
- `dailyIncrementPpm = (nav_t/nav_{t−1} − 1) × 1e6`.
- `stepEvent`: day where increment deviates from the trailing 30-day median by > 5 × MAD, or where a new price vector starts. Down-tick: increment < 0.
- `aumAttribution(t) = { navEffect: supply_{t−1} × (nav_t − nav_{t−1}), flowEffect: (supply_t − supply_{t−1}) × nav_t }`; residual = ΔAUM − both (show if ≠ 0).
- `netFlowUsd = Δsupply × nav`.
- `premiumBps = (marketPrice / nav − 1) × 1e4`.
- `liquidityCoverage = liquidityLayerUsd / aumUsd`.
- `layer.premiumToEL = netPremium / expectedLoss`; `layer.rateOnCapital = netPremium / capitalDeployed`.
- `bookExpectedYield = Σ(capital × expectedYield) / Σ capital`.
- `gini`, `lorenz`, `topNShare` over leaderboard totals.
- `sourceSpread = (max − min) / min` across AUM sources.
- `scheduledNav(t)` (**verified 2026-10-21 against the onre-sol program**, `programs/onreapp/src/instructions/offer/offer_utils.rs`, commit `c0490831`; implemented bit-exactly in `packages/metrics/src/vector.ts`): the active vector is the one with the latest `startTime` <= t (`find_active_vector_at`, L246). The price is fixed per `priceFixDuration` window and snaps to the **end** of the current window: `effectiveElapsed = (floor((t - baseTime) / dur) + 1) x dur`. Growth is **daily compounding**, not simple interest: `dailyFactor = 1 + apr/(1e6 x 365)`, `price = basePrice x dailyFactor^(effectiveElapsed / 86400)` with linear interpolation inside a day (`calculate_vector_price`, L277; round-half-up 18-digit fixed point). On 2026-10-21 the newest vector (start 2026-09-19) reproduces `/data/live-nav` exactly (1.157827091). The earlier draft of this formula (simple interest, whole-day elapsed, first vector) was wrong. The forward path is still labelled "scheduled, not guaranteed" because OnRe can add a vector at any time.
