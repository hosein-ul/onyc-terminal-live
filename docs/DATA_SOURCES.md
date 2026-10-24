# Data sources — verified map

Every endpoint below was called live on **2026-10-21** from the official app (app.onre.finance) or directly.
Sample values are what came back that day. Use them as sanity fixtures, never as hard-coded data.

**Rule for the build:** before writing code against any source, call it again, save a raw JSON/CSV fixture
under `packages/sources/fixtures/`, and write the zod schema from the real response. If a source changes
shape or disappears, the ingester must log it, mark the source `degraded` in `source_health`, and keep serving
the last good value with its timestamp. Never invent a value or a formula.

Status legend: ✅ public & verified · 🔒 auth required (do not use) · ⚠️ verify at build time

---

## 1. OnRe core API — `https://core.api.onre.finance`

| Endpoint | Status | Returns (2026-10-21) | Poll |
|---|---|---|---|
| `GET /data/live-nav` | ✅ | bare number `1.157827091` | 60 s |
| `GET /data/live-apy` | ✅ | bare number `0.1102` | 60 s |
| `GET /data/live-tvl` | ✅ | bare number `282827379.7358692` (USD) | 60 s |
| `GET /data/nav` | ✅ | `{data:[{net_asset_value_date:"10/21/2026", net_asset_value:"1.1578…", assets_under_management:"282827024.16…", fund_name:"ONyc", fund_id:1, circulating_supply:244273973.51…}]}` — daily, newest first, since 2025-05-28. Dates are `MM/DD/YYYY`, numbers are strings. | 1 h |
| `GET /settings` | ✅ | `primaryToken` (ONyc mint), `primaryAsset` (USDC mint), `misc.onycApy` "0.1102", `misc.sUSDeAPY` "3.5057…" (benchmark, **in percent units, not a fraction**), `misc.tvlValue`, `tokens{mint:{name,symbol,decimals,supply,tokenProgram,mintAuthority,image}}` for ONyc, USDC, USDG, USDT | 15 min |
| `GET /offers` | ✅ | Mint offers (USDG→ONyc and USDC→ONyc). Fields: `address`, `price`, `apy`, `activeNow`, `allowPermissionless`, `feeBasisPoints`, `validFrom`, `currentPriceFixDuration` (86400), `vectors[]{startTime, baseTime, basePrice (×1e9), apr (×1e6, e.g. 109239 = 10.9239%), priceFixDuration, state}` | 5 min |
| `GET /redemption/offers` | ✅ | Per redemption offer: `offerAddress`, `redemptionOfferAddress`, `tokenOutMint` (USDG / USDC), `feeBasisPoints` 25, `feeBasisPointsPropAmmSell` 20–30, `executedRedemptions` (e.g. 5,293,625.68 ONyc on the USDC offer), `requestedRedemptions`, `vaultTarget`, `disabled` | 5 min |
| `GET /redemption/settings` | ✅ | `{allowPartialRedemptions:true, coolDown:86400, growthRate:0.3485761, initialCapacity:3250000, maxCapacity:12000000, maxSharePerRequest:0.185, startTime:"2026-03-04T00:00:00Z"}` | 15 min |
| `GET /redemption/eta?publicKey=&amount=` | ✅ | both params required (400 otherwise). For a wallet with no pending request: `{eta:null, cooldown:null}`. Shape with a real pending request not seen — capture a fixture when one exists. | on demand |
| `GET /redemption/requests?page=&size=` | ✅ **public** (verified 2026-10-21 in a logged-in session, also callable without auth) | Spring page `{content:[…], page:{size,number,totalElements,totalPages}}`. Row: `{id, redeemer (wallet), redemptionOfferPda, redemptionRequestPda, redemptionTime, requestStatus, requestedAt, submissionTx, tokenInMint, tokenOutMint (USDC/USDG), amount, fulfilledAmount, fulfillmentTxs[]}`. On the check day: only **50** rows in total, newest `requestedAt` 2026-09-10, all `requestStatus:"EXECUTED"`, `requestedAt` is null on older rows, and `fulfilledAmount` is 0 on many EXECUTED rows (so it is not reliable alone). It does not reconcile with `/redemption/offers.executedRedemptions` (≈5.29M ONyc on the USDC offer): treat it as a partial log, show both, never sum it as total redemptions. Use it for the redemption feed and large-redemption alerts. | 5 min |
| `GET /accounts/me` | 🔒 | called by the app when a wallet is connected; returns 400 without the app's session. Do not use. | |
| `GET /token-balance` | 🔒 401 | do not use (use Helius for balances) | |
| `GET /offers/private`, `/analytics/*` on core | 🔒 401 | do not use | |

Notes from the logged-in app (wallet connected, 2026-10-21): besides the endpoints above the app calls `ipapi.co/json` (region check), Helius RPC with its own key (do not reuse it; use your own key) and Plausible analytics. No other private data endpoints appeared on the Deposit, DeFi, Transparency, Leaderboard or Portfolio pages.

Notes

- The NAV price is a piecewise-linear schedule: each vector says "from `baseTime`, price starts at `basePrice` and grows at `apr`". **Decode the vectors** to (a) draw the forward NAV path, (b) detect re-pricing events (the step on 2026-08-27 is a new vector), (c) compare scheduled vs reported NAV.
- `settings.tokens[ONyc].supply` = 169,246,816 while `/data/nav` circulating = 244,273,973. Different definitions or a stale cache. Show both in Data Health; do not pick one silently.

## 2. OnRe rewards API — `https://rewards.api.onre.finance/api/v1`

| Endpoint | Status | Returns | Poll |
|---|---|---|---|
| `GET /points/leaderboard?page=0&size=50` | ✅ | Spring page: `{leaderboard:{content:[{rank, address, totalPoints, pointsBreakdown{…}, rankChange, activeMultipliers[]}], pageable, size, number, totalElements, totalPages, first, last, empty}}` — **24,750 users** on 2026-10-21 (the UI shows 495 pages of 50). **`rankChange` is provided by the API** (integer, e.g. 0, −1, or null; the comparison window is not documented — verify by crawling twice a day apart and say "per OnRe" in the UI; still store our own daily snapshot for 7/30-day movement). `size=500` works but took ~20 s per page (≈50 pages ≈ 17 min for a full crawl); `size=25000` froze the browser tab. Crawl with `size=100–250`, 1–2 requests in flight, back off on slowness, and run it once a day off-peak. | daily full crawl + hourly top 500 |
| `GET /points/{wallet}` | ✅ | `{rank,address,totalPoints,pointsBreakdown,rankChange,activeMultipliers}` (for a wallet with no activity: rank = last place, `rankChange:null`, `activeMultipliers:null`). **`activeMultipliers`** on leaderboard rows: `[{sourceType:"GLOBAL", multiplier:0.0001, effectiveFromDate:"2026-10-03", effectiveToDate:null}]` — a global multiplier of 0.0001 effective since 2026-10-03; its meaning is not explained anywhere public and daily emission in `/analytics/points/growth` did not collapse after that date (≈1.2e9/day before and after, with a dip on 2026-10-03). Display it as-is with the label "unexplained by OnRe", never interpret. Breakdown keys: `wallet`, `permissionlessBoost`, `kamino{onyc,usdg,usdc,usds,onycJitosol,usdgOnyc}`, `exponent{yt,lp,markets{AUG-2025,JAN-2026,SEP-2026,SRONYC-SEP2026,ONYC-JAN2027,SRONYC-JAN2027:{yt,lp}},tranching{senior,junior}}`, `loopscale{onyc,usdc}`, `ratex`, `carrot`, `carrotLending`, `elemental`, `exponentVault`, `onreYieldPlus`, `orca{…}`, … (capture the full key set from a fixture) | on demand, cache 60 s |
| `GET /referrals/stats/{wallet}` | ✅ | `{walletAddress,totalReferrals,activeReferrals,pendingReferrals,totalReferralBonus,referralCode}` | on demand |
| `GET /referrals/eligibility/{wallet}` | ✅ | `{isEligible, currentRank, totalUsers, requiredRankThreshold}` — creating a referral code is gated by a rank threshold (values were null for an inactive wallet) | on demand |
| `GET /referrals/status/{wallet}` | ✅ | `{isReferred, referrerWalletAddress, referralCode, isActive, activatedAt}` | on demand |
| `GET /referrals/code/{wallet}` | ✅ | returns **404** `{message, code, params}` when the wallet has no code (treat 404 as "no code", not as an error) | on demand |

Referral rules as printed in the app: a referral stays pending until the referred wallet holds 100+ ONyc for at least three days; once active, the referrer earns 10% of the referred wallet's points.
| `GET /analytics/aum/growth` | ✅ | `{series:[{date, protocol, aumUsd, deltaUsd, deltaPct, normalizationMethod:"onyc_nav"}]}` — daily per protocol since 2025-06-04 (2,880 rows). Protocols: orca, wallet, kamino, exponent, loopscale, carrot, elemental | 6 h |
| `GET /analytics/capital/distribution` | ✅ | `{asOfDate, totalAumUsd, distribution:[{protocol, capitalUsd, sharePct}]}` — 2026-10-21: kamino 54.7%, loopscale 22.9%, exponent 11.8%, wallet 4.3%, orca 3.9%, elemental 2.5%, carrot 0.04% | 1 h |
| `GET /analytics/capital/reconciliation` | ✅ | circulating vs known-custody vs attributed-protocol vs unexplained, raw (×1e9) and USD, plus `entries[]` | 1 h |
| `GET /analytics/points/growth` | ✅ | `{series:[{date, basePointsIssued, referralBonusIssued, totalPointsIssued, dailyBaseGrowth, dailyReferralGrowth, dailyTotalGrowth}]}` — **only the last 31 days**, so store a daily snapshot to build long history | daily |

Notes

- In reconciliation, `unexplainedOnycUsd` (10,929,324.72) is exactly the `orca` figure in growth/distribution. The "orca" bucket looks like a residual, not a measured balance. Label it that way.

## 3. Published Google Sheets (used by the official app)

Base: `https://docs.google.com/spreadsheets/d/e/2PACX-1vT-bLCCxKNCB2GHgFV5Jo6_fbv4t3CT60dwPMbUDfwhHglt5GBoLp47jp1wcCOY8Ob1ZgjA6KXNczdq/pub?output=csv&single=true&gid=<GID>`

| gid | Content | Columns |
|---|---|---|
| `1418034083` | DeFi opportunities (30 rows; the app groups them as Looping, Lending & Borrowing, Liquidity Provision, Yield Trading, Vault Strategy, Risk Tranching). Besides ONyc, rows involve derived tokens: **srONyc / jrONyc** (Exponent senior and junior risk tranches of ONyc, APY ≈7.5% vs ≈17.4% on 2026-10-21) and **PT-ONyc / PT-srONyc** (principal tokens, 0x points). Keep tranche and PT assets as their own asset types in the model. | classification, protocol, strategy, activity, asset1..3_symbol/image, apy (fraction), tvl (USD), reward (points multiplier), link, is_new, coming_soon, featured, logo_url. **Contains subtotal rows with empty classification — drop them.** |
| `362705568` | Daily NAV mirror (510 rows) | nav_date, nav, aum, apy ("11.02%"), circulating_supply, changed |
| `1591707661` | Yield composition / collateral (16 rows) | Asset, Amount (USD), Allocation, APY, Liquidity Layer, Proof of Assets, …, plus a `Snapshot date` cell in the header row. Parse defensively. |
| `297157125` | **Reinsurance layers** (30 rows) | Layer Number (e.g. 9000002), UW Status (Bound/…), Inception (Mon-YYYY), Renewal, Major Perils, Structure (ILW / 1st Event Per Occ / 2nd Event Per Occ / 1st–3rd Event Aggregate / Quota Share), OnRe Capital Deployed, Net Premium to OnRe, OnRe Expected Loss, On Re Expected Annualised Yield. **Numbers use spaces as thousands separators** ("1 101 563"). |

Poll every 30 min. Store every fetch as a versioned snapshot and diff it: new layer, status change,
capital change, opportunity added/removed, APY moves. These diffs feed the activity feed and alerts.

Transparency page figures on 2026-10-21 (use as test fixture): Bound $152,722,725 · Offered $0 ·
Available $87,680,548 · Liquidity layer (15%) $42,424,107 · Total AUM $282,827,380 (the first, third and fourth add up to the total) ·
Yield distributed since inception $17.74M · Reinsurance APY 14.07%.

## 4. Proof of solvency — Accountable

- `GET https://onre.accountable.capital:8443/dashboard` ✅ → `{res:"ok", data:{collateralization:1.001993, attestations{…}, merkle_root{rootHash, signature, ts}, snapshot{collateral, liabilities, ts}, zkp{…}, …}}` (~12 KB). Map the remaining keys (reserves by venue, supply) from a fixture.
- Page showed: reserves $292.6M vs supply $292.0M, ratio 100.2%. Venues: Solana, Bank of New York Mellon (cash), Ethereum (sUSDS, USYC), Clarien Bank (cash), Radix ILS (cash). 7 custody wallets (1 Ethereum, 6 Solana) are listed on the page.
- **Most recent retrieval was 2026-10-15 while checked on 2026-10-21.** Staleness is itself a signal. Show the age and alert when it passes 24 h.
- Poll every 15 min.

## 5. Market and third-party data

| Source | Status | Use |
|---|---|---|
| Jupiter `https://lite-api.jup.ag/price/v3?ids=<mint>` | ✅ | ONyc market price (1.15598 vs NAV 1.15783 ⇒ −16 bps). Premium/discount every 60 s |
| GeckoTerminal `https://api.geckoterminal.com/api/v2/networks/solana/tokens/<mint>/pools` | ✅ | DEX pools, price, liquidity, volume, price change. Respect its rate limit (≈30/min) |
| DefiLlama `https://api.llama.fi/protocol/onre` | ✅ | TVL history (third-party view) |
| DefiLlama `https://yields.llama.fi/pools` filtered `symbol ~ /onyc/i` | ✅ | 10 ONyc pools (onre, kamino-lend, orca-dex, …) with APY/TVL. Large payload: fetch every 1 h, keep only matching rows |
| Solana RPC (Helius, key from env) | ⚠️ | token supply, largest holders, holder count (DAS), mint/burn history, custody wallet balances, onchain `MarketStats` PDA (decode with the Anchor IDL from github.com/onre-finance/onre-sol) |
| Exponent / Kamino / Loopscale / RateX / Orca / Raydium public APIs | ⚠️ | optional enrichments for the DeFi map; only if public and stable |
| Allez risk report PDF `https://allez.xyz/reports/onre/ONyc_Asset_Risk_Assessment_260731.pdf` | link | link out, don't scrape |
| Attestations / audits docs | link | `https://docs.onre.finance/legal/security-and-verification/independent-attestations`, `…/independent-audits` |

## 6. Constants (verified)

- ONyc mint `5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5` (9 decimals, Token program)
- OnRe program `onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe`
- USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` · USDG `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` (Token-2022) · USDT `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- Mint offers: USDG `8w1BAUUn6RbAtU3BuCUNXzHR7cxNyNga9pJLQYgpXJU`, USDC `E88zkA9Pxb1i8EfSHrEW5ZUe6hiQbo8DHWQ3WhDFw7p6`
- Fees (docs): management 0.75%, performance 20%; redemption fee 25 bps on requests, 20–30 bps PropAMM sell (from API)
- Legal: On Re SAC Ltd, Bermuda SAC, BMA Class F (DABA) and Class IIGB

## 7. Known data conflicts (surface these, don't hide them)

1. AUM: NAV API vs live-tvl vs DefiLlama vs Accountable supply ($282.8M vs $292.0M).
2. ONyc supply: settings token supply vs NAV circulating supply.
3. Redemption fee: DefiLlama listing says 0.25%, docs say ≥0.30%, API shows 25 bps request and 20–30 bps PropAMM.
4. Orca bucket equals the unexplained residual in reconciliation.
5. Layer numbering: sheet uses 9000000-style IDs; the official UI shows 0000-style.
6. Accountable retrieval lag.
7. **The official Transparency page can disagree with the official APIs.** Observed 2026-10-21 in a logged-in session (two reads, 16 s apart): the page header showed AUM "–" and Price $0.0000, and the fund section showed Total AUM $179,673,794, Available capital $0, Liquidity layer $26,951,069 and Yield distributed $0.00M, while `/data/live-tvl` returned 282.83M and `/data/nav` returned AUM 282.83M. The numbers match `bound ÷ 0.85` (152,722,725 ÷ 0.85 = 179.67M), so the page appears to derive AUM from bound capital when its AUM feed does not load. Lesson: never scrape the UI; compute from the APIs and the sheets, and alert when derived and reported AUM diverge by more than 1%.
8. **Layer status vs renewal date.** Layer 0002 (Contingency, 1st Event Per Occ) has renewal "Jul-2026" but is still `Bound` on 2026-10-21; the app has an "Expired" tab. Compute `monthsToRenewal` and flag bound layers past renewal as "renewal date passed, status not updated" instead of silently trusting the status.
9. Layer numbers in the app skip 0029 and 0030 (0000–0028 and 0031 are listed): 30 layers, not 32. Do not assume contiguous IDs.
10. Global points multiplier 0.0001 (since 2026-10-03) vs the "6x / 8x points" boosts in the DeFi sheet: the relationship is not explained by OnRe. Show both, label as "not reconciled".

## 8. Phase 1 re-verification (2026-10-21, build day)

Every source above was called again and saved under `packages/sources/fixtures/`. Where reality differs from the
sections above, reality wins; the differences are:

- **`/data/nav`:** 511 rows from 2025-05-28 to 2026-10-21, not 512: **2025-07-05 is missing**. Early rows have `assets_under_management: null` and `circulating_supply: null`. The sheet mirror (gid `362705568`) has 510 rows and stops at 2026-10-20 (it lags by about a day); its dates are ISO `YYYY-MM-DD`, not `MM/DD/YYYY`.
- **NAV is not monotonic.** The history has four down-ticks: 2025-07-06 (−2,439 ppm, across the missing 07-05), 2025-07-15 (−443 ppm), 2025-07-29 (−1,166 ppm) and 2025-08-01 (−746 ppm). SPEC's "max drawdown should be about 0" holds only since August 2025. The worker records each as a `nav_downtick` event.
- **Leaderboard:** 24,754 users (not 24,750). `size=250` answered in about 1.7 s today (the 20 s per 500-row page seen earlier was not reproduced). The full crawl at `size=250`, one request in flight and a 0.5 s pause took **3 minutes for 100 pages**, 24,754 wallets. The crawl is still sequential and backs off when a page takes over 8 s.
- **`/redemption/requests`:** the row `id` is **not unique** (it is a per-offer counter: 50 rows, 42 distinct ids). `redemptionRequestPda` is unique and is the key we store.
- **Sheets:**
  - Reinsurance: 30 layers, **all `Bound`** (including layer 0002, renewal Jul-2026). Their capital sums to **152,722,725**, exactly the Transparency page's "Bound" figure.
  - Opportunities: 28 real rows plus 2 subtotal rows (empty classification), which are dropped. There is no id column; the key is classification, protocol, strategy and assets.
  - Collateral: the `Snapshot date` cell is **DD/MM/YYYY** (`20/10/2026`); APY and Allocation are percent units (3.656 = 3.656%). The sheet's own `Total` row (289,827,019.67, equal to the sum of its asset rows) differs from its `AUM` row (283,623,613.83) by about 6.2M. Both are kept; treat as conflict 11 below.
- **Core API values drift through the day** (live TVL 282,827,380 in the morning, 282,829,656 later); fixtures hold the later values. Reconciliation `*Raw` fields exceed 2^53 and are only approximate in JSON.
- **Referral code 404 body:** `{"message":["Referral code not found"],"code":"600101","params":{}}`.
- **`/offers`:** both mint offers carry the same three vectors; `price` equals `/data/live-nav`.
- **Accountable:** `data.ts` is epoch milliseconds (2026-10-15T05:43:01Z, six days old on 2026-10-21); `merkle_root.ts` is a string.
- **DefiLlama yields:** the full payload is 11 MB and took about 47 s; the worker keeps only the 10 ONyc pools. Protocol TVL on DefiLlama was 294.2M (another AUM view, conflict 1).
- **Jupiter `lite-api.jup.ag/price/v3`** still works without a key. GeckoTerminal returned 20 pools on page 1.
- **Google Sheets** answered in 2–13 s and **failed once with a network error** (three attempts) during the build; later runs were fine. Treat as intermittent.
- **Helius** was not verified: no key was available. The client in `packages/sources/src/helius.ts` is untested against the live service.

11. **Collateral sheet Total vs AUM** (289.83M vs 283.62M, same sheet, same date) is a new known conflict, in addition to §7.

## 9. Phase 2 findings (2026-10-21)

- **Price vectors decoded.** The active vector is the one with the latest start time; price compounds daily and snaps to the end of the day window (SPEC, metric definitions). The decoded schedule equals `/data/live-nav` to the last digit.
- **NAV-implied APY matches the reported APY.** Compounded from the 7-day and 30-day NAV change it is 11.02%, the same as `/data/live-apy`. Return since 2025-05-28 is 14.75% (the "14.7%" in the Calm reference is that number).
- **"Liquidity layer (15%)" is a policy share, not a balance.** 15% of AUM equals the Transparency page's liquidity layer exactly (42,424,107 on 282,827,380). The collateral sheet rows flagged as the liquidity layer sum to a different, measured figure (about 67.2M, 23.8% of AUM). The API shows both: the capital stack uses the policy share, coverage and the risk signal use the measured balance against the 15% target.
- **Conflict 7 reproduces from our data**: bound capital divided by 0.85 is 179,673,794, the figure the official page showed.
- **The capacity curve for redemptions is not in the program source either.** Only the parameters are shown.

## 10. On-chain layer (Phase 8, verified 22 October 2026)

Read-only, from Solana mainnet through `HELIUS_API_KEY` when set and otherwise the public RPC (`https://api.mainnet-beta.solana.com`, rate limited, used by the worker at a polite pace). The program source is `github.com/onre-finance/onre-sol` (`programs/onreapp/src`); account layouts were read from it and checked against live accounts.

| What | Address / method | Verified |
| --- | --- | --- |
| Program | `onreuGhHHgVzMWSkj2oQDLDtvvGvoepBPkqyaubFcwe`, upgradeable loader | executable |
| ONyc mint | `5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5`, Token program, 9 decimals | supply 254,834,855.17 |
| State | `EL5qwcpKyc2FuQxjWmVLEwpcb4LXXwwWWjMYjf1yi3to` (PDA `["state"]`) | matches the discovered account |
| MarketStats | `BuPMet2URHuTVKSHpj32AjsXxHgdsqeA1i82dr1b4Mi5` (PDA `["market_stats"]`) | matches |
| Offers (608 bytes) | USDG `8w1BAUUn6RbAtU3BuCUNXzHR7cxNyNga9pJLQYgpXJU`, USDC `E88zkA9Pxb1i8EfSHrEW5ZUe6hiQbo8DHWQ3WhDFw7p6` (the main offer), USDT `AvAQ8PCsNigWk1qL5TxR7e5oYZ6gfgak99ytNJnp7mQe` (no vectors) | 3 accounts |
| Redemption offers (256 bytes) | USDC `3pLK2vXD2uy9PPZuYZNZWkkP9CTEuGrhS2uYFRUWZrSu`, USDG `H1EHA35ZuZq5vPtSRjyE7XdHqXCbi15A9CBHdgqYo3Xc` | executed totals equal the API |
| Redemption requests | `getProgramAccounts` filtered by the `RedemptionRequest` discriminator | 0 accounts: a request is closed once fulfilled |
| Boss / worker | boss `45YnzauhsBM8CpUz96Djf8UG5vqq2Dua62wuW9H3jaJ5`, worker `authVN3SAsujqwYq66mMhnCYV1YQnvbZjJFFhPExkrT`, 2 admins | not killed |
| Vault authorities | PDAs of `offer_vault_authority`, `redemption_offer_vault_authority`, `reserve_vault_authority` | derived locally, checked |

Method notes: accounts are found by Anchor discriminator (first 8 bytes of sha256 of `account:<Name>`) with `getProgramAccounts` (worker only, filtered, cached), so no address is guessed; PDAs are derived locally (`packages/sources/src/onchain/pda.ts`); instructions are named from the first 8 bytes of sha256 of `global:<name>` for every `pub fn` in `lib.rs` (all 100 recent program signatures were classified, none unknown). Fixtures: `packages/sources/fixtures/onchain/`. Live check: `node scripts/chain-probe.mjs state|holders|activity`.

Findings and mismatches between the API and the chain:

1. **NAV agrees to the last digit.** The program's stored NAV (MarketStats, 1.158158753) equals `/data/live-nav`, and the price-vector formula in `packages/metrics/src/vector.ts` reproduces it exactly from the vectors decoded from the Offer account (test `packages/metrics/src/onchain-nav.test.ts`). The formula and its source lines (`offer_utils.rs` 246, 277, 378) were already cited in SPEC.md and are unchanged; the forward path is now verified against chain data and not only the API. MarketStats APY (11.02%) equals `/data/live-apy`.
2. **Conflict 2 is explained.** Mint supply is 254.83M ONyc; the program's circulating supply is 244.83M because `calculate_circulating_supply` (`market_stats.rs`, line 217) subtracts the balance of the excluded account, the boss wallet, which holds 10.006M ONyc. The two supply figures differ by definition and both are right. The live TVL equals circulating supply x NAV ($283.5506M), so the API AUM is not an independent measure of assets.
3. **The independent solvency figure is Accountable against total supply.** Total supply x NAV is $295.14M. Accountable reports reserves of $292.60M (-0.86%) and supply of $292.01M, retrieved 7 days ago. Custody visible on chain is only $13.6M (stablecoins and ONyc in the program vaults and the boss wallet): most reserves are off chain. The alert threshold is `CHAIN_AUM_GAP_ALERT` (default 2%).
4. **Redemption offers match the API exactly** (USDC executed 5,293,625.68 ONyc, fee 25 bps, PropAMM 20 bps; USDG 14.9, 25, 30). The OnRe docs state a 30 bps service fee on another page, so conflict 3 stays open. No redemption request is open on chain, so the queue is empty; the public `/redemption/requests` log (a partial history) remains the only record of past requests besides transactions.
5. **Holders.** 20,235 token accounts, 9,516 non-empty, 9,329 distinct owners; the top 10 hold 83.7% and the top 100 95.6% (Gini 0.9955). The points leaderboard has 24,773 wallets, a different population (anyone who earned points, not only holders).
6. **Capital by protocol, chain against the rewards API.** Kamino: the lending-market account holds 134.08M ONyc = $155.28M against $154.95M (+0.2%). Exponent: 28.94M ONyc = $33.52M against $33.50M (+0.06%). Loopscale and Orca match only partly ($33.7M of $64.8M, $3.2M of $10.9M) because the rest sits in program-derived accounts this tool cannot yet label; that is shown as a difference, not hidden. A holder is labelled by a fixed OnRe address, by the program that owns its account, or, for the 40 largest unlabelled program-derived addresses, by the known program called in the account's latest transaction (an inference, marked as such).
7. **srONyc and jrONyc.** Jupiter's token list has the PT-srONyc mints (`HSbdobdvfGAfqKWSWZ7s2XfFx1P1FJutTa96MHJtkm5`, `BKP9Rt3pwh96cCoCp3bkh1zxXZpZez17xA6w64LuMJQy`) but no srONyc or jrONyc mint, and Exponent's market accounts were not read, so Wallet Lab shows ONyc only. This stays open.
8. **Activity.** Program transactions and ONyc mint transactions are polled about once a minute, each lane with its own cursor that only moves over transactions that were handled (at most 40 are read per run, so a backlog drains over several runs without skipping any). Every program instruction is recorded; ONyc moves into or out of a known protocol and other ONyc transfers are recorded from 10 ONyc up (`CHAIN_VENUE_MOVE_ONYC`, `CHAIN_TRANSFER_MIN_ONYC`); only transfers of 100,000 or more raise an alert (`CHAIN_LARGE_TRANSFER_ONYC`). Each is stored in `chain_events`, classified (mint, redemption, PropAMM, price vector, configuration, vault move, stats refresh), and notable ones are also written to `events`, which feeds the existing alerts stream.
