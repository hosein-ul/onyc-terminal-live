# Critique log

## 2026-10-21, Phase 3 chart gallery (web-calm and web-platinum, intermediate step)

Scope: the `/_charts` gallery only. The apps have no pages yet, so this is a check of the chart skins, not of the product's look.

**What was run**

- `slop-check` on both `src` folders: 1 FAIL, `no-asset` (no canvas/image/3D/generated SVG counted). The gallery's visuals are charts drawn at
  runtime by libraries; the made asset (Calm hero, Platinum ring and rail) arrives with the Phase 4 and 5 pages. Everything else passes (no banned
  fonts, no cream or serif, no gradient text, no glow, no emoji icons, Lucide only).
- Desktop screenshots at 1440 px of both galleries, read in full, fixed in a loop: dark labels on dark treemap tiles (now chosen by contrast),
  colliding Gantt legend, clipped y-axis names, unreadable bullet and ring text, stack-bar labels overlapping on a phone, intraday x labels
  repeating the same date, the NAV sparkline plotted out of order (string sort of "day -10"), PNG export in a fallback font (fonts now embedded).
- Phone check at 390 px with touch emulation (dpr 2): no horizontal overflow on either app; waterfall labels wrap; wide chart types scroll
  inside their frame. Not run: the full stepped-scroll contact-sheet loop and throttled-CPU timing from `mobile-verification.md`.
- `scripts/verify-charts.mjs`: 9/9 on both apps.

**Not done, deliberately deferred to Phase 4/5 when there are pages**

- The 15-line rubric score and the blind-critic subagent: they judge a whole screen, and a gallery of cards is not one.
- Comparison with a peer product; signature moments (Calm headline sentence, Platinum thin numerals).

**Known weaknesses**

- Calm: tooltips and frames are clean but the cards are a uniform grid; the real pages must vary tile sizes and lead with the headline sentence.
- Platinum: Tremor bar lists look stock until the page layout and the numerals carry the identity; Tremor charts have no keyboard crosshair.
- Both: sankey labels at the right edge are small for the thinnest nodes (rows under 1% are grouped).

## 2026-10-21, Phase 4: web-calm, all 11 pages

Scope: Overview, NAV & Yield, Peg & Liquidity, Reinsurance Book, Capital & DeFi, Points, Wallet Lab (with and without an address), Risk &
Transparency, Data Health, Activity & Alerts, Developers, plus the shell (sidebar, phone menu, footer), against the live API.

**What was run**

- `slop-check` on `apps/web-calm/src`: 1 FAIL, `no-asset`. The check only counts `<canvas>`, images, video or 3D; this app's visuals are the
  charts (SVG from Recharts and ECharts), a computed brand mark, a favicon and a social image made in code (`scripts/make-brand-calm.mjs`).
  All colour, type and effect checks pass: Figtree only, no serif, no cream, no gradient text, no glow, no emoji, Lucide icons.
- Desktop (1440 px) and phone (390 px, touch, dpr 2) sweep of all 12 routes with `reducedMotion`: no console errors, no horizontal overflow,
  no skeleton left on screen, no error banner. Two overflow bugs found and fixed (long error strings in Data Health and Activity).
- Phone menu: opens as a dialog, Escape closes it, tapping a page navigates and closes it; first Tab reaches the skip link.
- Looked at: Overview, NAV & Yield, Risk, Wallet result (desktop) and Overview (phone) in full; the other pages through the sweep metrics.
- Fixed while looking: KPI change shown as an absolute dollar figure when the API sent a relative one (now explicit in the contract:
  `changeMode`), supply shown in dollars (it is ONyc), "0 bps change" shown for a metric with one day of history (now "collecting since"), a
  headline that disagreed with the since-launch return (now taken from the NAV endpoint), a duplicate sentence on Risk, "top 0.0%" for rank 1.

**Not run, and why**

- The blind-critic subagent and the 15-line rubric score: this session does not spawn subagents unless asked; the owner should score the
  screenshots in `docs/screens/` (overview, NAV and risk of every app on desktop and phone; regenerate all pages with `scripts/sweep-pages.mjs`).
- The stepped-scroll contact sheets and throttled-CPU timing from `mobile-verification.md`. Bundle: about 230 KB gzip initial, ECharts loads on demand.
- A side-by-side with a peer product.

**Known weaknesses**

- The signature (a plain-language headline per page) is on every page, but the pages below the first screen are card-heavy; tile sizes vary
  but the rhythm is still close to a dashboard kit. The next pass should give Overview a stronger single moment (a larger NAV figure treatment).
- Risk shows 12 equal cards; severity does not change their size.
- Tables on phones hide the "wide" columns and scroll the rest; the Reinsurance table is the densest.

## 2026-10-22, Phase 5: Platinum, Cobalt, Pastel, Matrix (eleven pages each)

Scope: the four remaining directions against their references in `design/refs/`, plus a recheck of Calm.

**What was run**

- Desktop (1440 px) and phone (390 px, touch, dpr 2) sweep of all 12 routes in all five apps with reduced motion: no console errors, no horizontal
  overflow, no skeleton left. The phone menu (open, Escape, tap to navigate) and the skip link were checked on all five.
- Read in full by eye: Platinum Overview, Cobalt Overview, Pastel Overview and Developers, Matrix Overview, NAV and Capital. Fixed while looking: Platinum
  and Pastel `shell.css` not imported, headline highlight regex that lost its backslashes (highlighted the letter d), Pastel bar-list colour, Cobalt duplicate APY
  figures and unit text on white, Matrix dot-matrix full stop reading as a comma below 40 px (smaller figures moved to the mono face), ECharts decal not applied
  (moved to the series `itemStyle`), end labels of the stacked area overlapping.
- Contrast of text pairs measured for all five (table in `.design/direction.md`).

**Not run**

- The 15-line rubric and the blind critic for any app; a peer comparison; throttled-CPU timing; Lighthouse.
- Cobalt, Pastel and Matrix inner pages (Reinsurance, Points, Risk, Health) were checked through the sweep metrics and a few screenshots, not read one by one.

**Known weaknesses**

- Four of the five apps share one page structure (the derived page code), so the directions differ most on Overview and in type, colour, shell and chart skin;
  the inner pages differ less in composition than the references would allow.
- Cobalt: with only white and light blues, the eight chart series are told apart by lightness alone; the stacked area on a phone is the weakest case.
- Matrix: Tremor-style rings and bars do not apply; the dotted fills are ECharts decals, so their dot size does not scale with the chart.
- Pastel: Tremor's bar list puts the label inside the bar, so very short bars show text over the page colour.

## Overview pass 2 (22 Oct 2026, owner review of the live Calm and Pastel screenshots)

- Fixed: unexplained rings on the NAV line now have a key with counts; waterfall is tonal with dashed links, narrower bars and the total in the accent; the repeated 'Collecting since ... no 30d change yet' note is now 'Tracked since <date>'; the minus sign in tabular figures no longer floats away from its number.
- Added: Overview shows the collateral Sankey beside capital by protocol; the capital stack bar is a slim full-width row.
- slop-check: same single FAIL no-asset (charts and the computed brand mark are the visuals). Not done: Pastel digit spacing, Pastel nav wrap, the other four apps' Overview layouts, blind critic.

## Overview pass 2 in the other four apps (22 Oct 2026)

- Cobalt, Matrix, Platinum and Pastel got the same changes as Calm: a key for the markers on the NAV line, tonal waterfall with dashed links (shared ECharts layer), the collateral Sankey, 'Tracked since <date>' notes and the minus-sign fix. Pastel: one-row menu, proportional digits in large type, Sankey in a full-width block because a narrow column clipped its labels.
- Seen in headless screenshots at 1440 px (shoot-overview.mjs). slop-check: the same single FAIL no-asset per app (platinum also its radius WARN). Not done: phone screenshots of these Overviews, blind critic, the Matrix menu still wraps to two rows.
