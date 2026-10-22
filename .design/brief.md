# Design brief — ONyc Terminal, Dot Matrix app (web-matrix) chart and skin redo

Scope: only `apps/web-matrix`. The other four apps stay as they are until the owner approves the result here.

## What it is

A read-only analytics terminal for a tokenized reinsurance token (ONyc). Project type: data-dense tool (domains: dashboard / instrument). The Dot Matrix app is its "device read-out" reading: dot-matrix type and a black screen set in a light dotted page.

## Who, where

Crypto-native and treasury readers checking NAV, peg and capital, on a laptop, sometimes on a phone, often glancing for under a minute. They know basis points and NAV.

## The one job

See, in five seconds, what ONyc is worth, whether it holds its peg, and where the capital sits, and trust each number because its source and age are shown.

## The specific truth

The data is a slow-moving, mostly smooth series (a NAV that rises daily), a few discrete events, and several part-of-whole splits. Owner feedback on the current Matrix look: the lettering is only partly dot-matrix, the charts use hatch fills, step lines and spiky bars that read as dated and noisy, and the theme is not a clean mono white or dark. Eleven pages are too many for this version.

## Content inventory (only what exists)

- Words: page headlines as plain sentences, source and age under every figure, the footer disclaimer.
- Things to look at: NAV history, market price against NAV, AUM change split into NAV effect and flows, capital by protocol, collateral split, capital stack, daily NAV increments, points distribution.
- Things to do: switch range, switch light and dark, read a table version, export CSV or PNG, follow links out. Nothing is sent or signed.
- Real facts: all from the live API (`/v1/*`). No invented numbers.
- Missing: some history charts are young and say "collecting since".

## Flows

1. Open Overview, read NAV and peg, glance at the events, leave. 2. Open one topic page to check a number's source. 3. Switch to the table view or export.

## The world

LED message board, dot-matrix printer, thermal receipt, line printer with tractor-feed holes, 5x7 character cell, dither screen, halftone newsprint, scoreboard, split-flap, plotter pen, braille cell, punch card, perforated paper, ribbon, ticker tape, bitmap fonts.

## Looking around (principles, not looks)

| Studied | Principle extracted | Not taking |
| --- | --- | --- |
| LED matrix signs and scoreboards | a value is a lit pattern; unlit cells stay faintly visible so the grid is the structure | glow, neon, colour animation |
| 1-bit dithering (ordered Bayer, error diffusion) | tone from density of two colours only, so a chart can be rich without a palette | retro-OS window chrome |
| Thermal receipt and line-printer output | the page itself is the device; mono type does the layout | skeuomorphic paper curls |
| Character-cell charts (blocks, braille) | a chart can be typeset, so it scales and prints crisp | ASCII cosplay on content that is not data |

Conventions to keep: source and age under every number, range control, table view, export. Empty conventions to break: tinted fills under every line, equal-weight bar spam, a library's default tooltip and legend look.

## Candidate ideas ("this is a Y")

1. ONyc is a message board: values are lit dots on a grid. 2. ONyc is a print job: tone by dither density. 3. ONyc is a receipt: charts are typeset characters. 4. ONyc is a plotter drawing. 5. ONyc is a split-flap board. 6. ONyc is a heat-map wall.

Chosen three: A (LED board, idea 1), B (Dither print, idea 2), C (Receipt tape, idea 3). Brave: B, it drops lines and fills for density only. Quiet: C, it is just type.

## Autopilot, named and set aside

Visual: dark neon terminal with a green signal colour, glow, tickers (attractor C), and the studio's own mint-on-petrol house style (L). Here: strictly monochrome, no glow, no signal colour.
Content: a stats band, a feature grid, a long landing page. Not justified; this is a tool.

## Asset plan

Brand mark: the rising line as dots. Hero: the NAV chart itself, in the direction's medium. Section visuals: the other charts in the same medium. Backgrounds: dot grid page. Social image and favicon: regenerate from the chosen medium. Empty and loading states: unlit dot grid. Icons: Lucide.

## Axis table

| Axis | A: LED board | B: Dither print | C: Receipt tape |
| --- | --- | --- | --- |
| Idea | values are lit cells on a grid | tone is dot density | the chart is typeset text |
| Temperature and value | neutral, black ground | neutral, white ground | neutral, mid-grey ground |
| Colour strategy | achromatic, lit against unlit | achromatic, two inks | achromatic, ink and one inverse block |
| Type voice | dot-matrix display (Doto) + mono | pixel caps (Silkscreen) + mono | typewriter / line-printer (Courier Prime) |
| Density and pace | balanced, one huge read-out | dense, print-like | dense, tape-like single column |
| Geometry and surface | square cells, flat | square, 1-bit texture | square, perforated edges |
| Imagery medium | computed LED grids (canvas) | ordered dither (canvas) | characters and braille (text) |
| Layout archetype | black screen over dotted page | framed sheets in a grid | one long column tape |
| Motion character | stepped scan-in, per column | stepped threshold sweep | typewriter line by line |
| Tradition crossed | LCD / dot-matrix display | Halftone / dither / bitmap | Receipt / thermal / line printer |

Pairwise differences: A/B 9, A/C 9, B/C 9 (each at least 6).
Hard checks: typefaces differ ✓ · ground values differ (black, white, mid-grey) ✓ · openings differ ✓ · imagery media differ ✓ · at most one data-led ✗ (the product is data; all three show its data, which is its content, not decoration) · none matches an attractor ✓ · ledger checked ✓

Ledger note: the ledger flags Doto in direction A because an unrelated parked project used it. Doto is the owner's own choice for this app (docs/DESIGN.md) and the owner asked for literal dot-matrix lettering, so it stays; this is a deliberate override, not drift.

## Page count (Matrix version only)

Current 11 pages become 6: Overview · NAV and Peg (NAV and Yield + Peg and Liquidity) · Book (Reinsurance + Capital and DeFi) · Points and Wallets (Points + Wallet Lab) · Risk and Health (Risk and Transparency + Data Health) · Alerts and API (Activity and Alerts + Developers).

## Owner feedback, 22 Oct 2026 (after the first board)
A, B and C rejected: charts built from dots read as a joke, the default was dark when the owner asked for light white with a dark alternative, and the fonts (Silkscreen, Courier Prime) and chart styling looked bad. Corrected direction D: white ground by default with a monochrome dark alternative; real charts (Apache ECharts, styled in ink and greys, square caps, hairlines, direct labels); the dot-matrix identity only in the wordmark and the big NAV numeral (Doto) and the calendar's square cells; Geist for the interface and Geist Mono for figures; no boxes, hairline rules and whitespace instead. Lab: https://onyc-matrix-lab.vercel.app
