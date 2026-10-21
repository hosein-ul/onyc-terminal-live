---
project: ONyc Terminal
mode: inherit
direction: Five fixed directions (Calm Fintech, Cobalt Field, Dot Matrix, Platinum Rail, Pastel Blocks)
chosen: 2026-10-21 by the owner, before the build, in docs/DESIGN.md and design/refs/*.html
---

# Direction — five fixed directions, one per app

The owner chose and specified these before any code existed. Source of truth: `docs/DESIGN.md` (tokens, type,
layout, chart skin) and `design/refs/*.html` (layout, spacing, component shapes). This file only locks them
for the design gate. Where this file and DESIGN.md differ, this file wins (see "Agreed deviations").

## Concept
ONyc Terminal is five readings of one read-only data product, each a different visual world; every number carries
source and age.

## Position
| App | Temperature · Value · Geometry · Type voice · Layout archetype |
| --- | --- |
| web-calm | cool, light, 24 px radius, rounded humanist sans (Figtree), left sidebar + cards |
| web-cobalt | saturated, mid-dark, 28 px radius pills and panels, grotesk + mono, top nav + giant numeral |
| web-matrix | neutral, light, square, 1 px ink borders, dot-matrix numerals + mono, segmented nav + black screen |
| web-platinum | cool, dark, 22 px radius, light-weight geometric sans + mono, icon rail |
| web-pastel | neutral white page, 30 px radius, Onest, 3-column pastel blocks, colour = topic |

## Colour (Calm and Platinum measured; others in DESIGN.md)
| Role | Calm | Platinum | Contrast |
| --- | --- | --- | --- |
| ground | #EEF2F6 | #12151B | — |
| surface | #FFFFFF | #1A1F27 (panel), #0D1015 (rail) | — |
| line | #E4E8EE | #232933 / chip #2F3744 | decorative |
| text | #101828 (15.8) | #F1F4F8 (16.6) | AA |
| text-2 (muted) | #475467 (6.8 on ground) | #8C97A8 (5.6 on panel) | AA |
| accent | #0B6BCB (5.3 on white) | #8FB4FF (8.0 on panel) | AA |
| positive | #0B5C3E on #DDF3E8 (6.9) | accent-tinted, never green on dark | AA |
| negative | #9A1B3A on #FDE7EC (6.9) | #FF8FA3 (7.7 on panel) | AA |

Strategy: one accent per app; colour carries meaning (state, series, topic). Single theme per app.

## Type
Calm Figtree · Cobalt Bricolage Grotesque + Geist Mono · Matrix Doto (numerals and wordmark only) + Geist + Geist Mono ·
Platinum Outfit + Geist Mono · Pastel Onest. All free (Google Fonts / Fontshare / OFL), loaded via @fontsource.
Tabular numerals for every figure. No Inter, Roboto, Space Grotesk, serif display.

## Space and grid
Per DESIGN.md: Calm 20 px gaps, 220 px sidebar; Platinum 76 px rail; Pastel 3-column masonry; Cobalt top nav; Matrix
16 px dot grid. Phone ≥ 360 px on every page.

## Shape
Radius per app as above. Calm: no borders, no shadows. Platinum: 1 px border, no shadow. Matrix: square, ink borders.

## Signature device
Calm: plain-language headline sentence per page. Cobalt: oversized numerals. Matrix: dot-matrix numerals on the black
screen. Platinum: thin numerals and ring progress for single ratios. Pastel: colour = topic.

## Visual asset system
Data is the imagery. Charts are drawn by well-known libraries, fully skinned from each app's tokens
(`docs/CHARTS.md`). Icons: Lucide, one stroke width. No logos from OnRe.

## Motion
Quiet and short: 150–250 ms ease-out; chart enter ≤ 300 ms; `prefers-reduced-motion` turns all of it off.
Never animates: numbers counting up, gradients, layout on load.

## Components
Loading = skeletons shaped like the content. Empty = what will appear and why not yet. Error = which source failed
and that the last good value is shown. Every KPI: value, change, period, source, age. Tables right-align numbers.

## Voice
Plain, factual, short. "Collecting since 21 Oct" when history is short. Static conflicts are labelled as dated
observations. Never marketing language.

## Agreed deviations from DESIGN.md
- Platinum big numerals use a flat silver fill (`#C9D1DB`), no gradient text; metallic gradient bars are allowed
  on bars only, tonal and one hue family.
- Rings only in Platinum, for single ratios.

## Never in this project
- Pie or donut charts. Library default themes. Gradient-filled text. Glow. Emoji icons. Cream, serif, terracotta.
- Cards inside cards; identical card grids.

## Files
Tokens: `apps/web-*/src/tokens.css` (one per app, created when the app is built). Spike tokens:
`spike/tokens/calm.css`, `spike/tokens/platinum.css`. Directions archive: `design/refs/`.
