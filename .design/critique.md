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
