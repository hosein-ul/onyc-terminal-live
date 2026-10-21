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

| App          | Temperature · Value · Geometry · Type voice · Layout archetype                                     |
| ------------ | -------------------------------------------------------------------------------------------------- |
| web-calm     | cool, light, 24 px radius, rounded humanist sans (Figtree), left sidebar + cards                   |
| web-cobalt   | saturated, mid-dark, 28 px radius pills and panels, grotesk + mono, top nav + giant numeral        |
| web-matrix   | neutral, light, square, 1 px ink borders, dot-matrix numerals + mono, segmented nav + black screen |
| web-platinum | cool, dark, 22 px radius, light-weight geometric sans + mono, icon rail                            |
| web-pastel   | neutral white page, 30 px radius, Onest, 3-column pastel blocks, colour = topic                    |

## Colour (Calm and Platinum measured; others in DESIGN.md)

| Role           | Calm                     | Platinum                           | Contrast   |
| -------------- | ------------------------ | ---------------------------------- | ---------- |
| ground         | #EEF2F6                  | #12151B                            | —          |
| surface        | #FFFFFF                  | #1A1F27 (panel), #0D1015 (rail)    | —          |
| line           | #E4E8EE                  | #232933 / chip #2F3744             | decorative |
| text           | #101828 (15.8)           | #F1F4F8 (16.6)                     | AA         |
| text-2 (muted) | #475467 (6.8 on ground)  | #8C97A8 (5.6 on panel)             | AA         |
| accent         | #0B6BCB (5.3 on white)   | #8FB4FF (8.0 on panel)             | AA         |
| positive       | #0B5C3E on #DDF3E8 (6.9) | accent-tinted, never green on dark | AA         |
| negative       | #9A1B3A on #FDE7EC (6.9) | #FF8FA3 (7.7 on panel)             | AA         |

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

Tokens: see the last section. Spike tokens (deleted after Phase 3):
`spike/tokens/calm.css`, `spike/tokens/platinum.css`. Directions archive: `design/refs/`.

## Colour, measured for the other three apps

| App    | Pair                                                         | Contrast                                |
| ------ | ------------------------------------------------------------ | --------------------------------------- |
| Cobalt | white on field #1535E8 / on deep #0E24B8                     | 7.8 / 10.7                              |
| Cobalt | muted #BFCBFF on field / on deep                             | 4.9 / 6.7                               |
| Cobalt | #0A1FA8 on white (inverse card)                              | 11.8                                    |
| Matrix | ink #0C0D10 on ground #E6E9EE                                | 16.0                                    |
| Matrix | muted #4B525C on ground / on panel                           | 6.5 / 7.4                               |
| Matrix | signal #3DDCC4 on screen #0C0D10                             | 11.3                                    |
| Matrix | screen-muted #9AA2AF on screen                               | 7.6                                     |
| Pastel | ink #101426 on white / on sky / mint / rose / lilac / butter | 18.3 / 14.0 / 14.8 / 13.6 / 13.5 / 15.2 |
| Pastel | muted #44506B on block #F3F5F9                               | 7.4                                     |
| Pastel | negative #9A1B3A on rose; #14523A on mint; #5C4A00 on butter | 6.0 / 7.4 / 7.2                         |

Cobalt shows up and down with the glyphs ▲ and ▼ and with dashed or solid capsules, never with red and green. Matrix uses the
dot-matrix face only for the wordmark and the largest figures, because its full stop reads as a comma below about 40 px.
Pastel's colour is topic only: each page sets one topic (`apps/web-pastel/src/layout/topic.ts`) and its blocks take that colour.

## Files (all five apps)

Tokens: `apps/web-<app>/src/tokens.css`, with the chart skin as `--chart-*` variables. Skin overrides: `shell.css` (shared markup and
class names) plus `cobalt.css`, `matrix.css`, `pastel.css`, and the Platinum block at the end of its `shell.css`.
