> **Single frontend (Phase 8).** Only Calm is built. Sections 2 to 5 are kept as history of the cancelled directions. Calm's palette is now Black + Warm Brand Yellow: black #111111, white #F8F8F6, warm yellow #F4D64E (used sparingly), border #DADAD5.

# Design — five directions, five separate apps

The owner picked these five from a larger set. Reference mockups (Market screen only) are in `design/refs/`.
They are written in an internal "Design Component" HTML format: ignore the `<x-dc>`, `<helmet>`, `{{…}}` holes and the
`<script type="text/x-dc">` block; read them for layout, spacing, color, type and component shapes.
The charts in the refs are placeholders — build real ones per CHARTS.md, styled to each direction.

Every app expands its reference into all 11 pages of SPEC.md while keeping its own character.

Hard bans (all apps): warm cream backgrounds, serif display type, terracotta/clay accents, purple-to-blue gradients,
Inter or Space Grotesk, emoji as icons, glow/neon effects, identical bento grids of same-size cards, pie or donut charts,
default-themed library charts (libraries are fine when fully skinned). Icons: inline stroke SVG (Lucide is acceptable, 1.75–2 px stroke).

Each app is single-theme (the direction _is_ the theme). Contrast ≥ 4.5:1 for text, including small grey labels.

---

## 1. Calm Fintech — `apps/web-calm` · ref `1-calm-fintech.html`

Mood: a trustworthy retail fintech app. Quiet, airy, friendly sentences ("ONyc is up 14.7% since launch").

- Colors: ground `#EEF2F6`, surface `#FFFFFF`, ink `#101828`, muted `#475467`, line `#E4E8EE`, accent `#0B6BCB` (active nav bg `#E8F1FB`, text `#0B4F99`), positive `#0B5C3E` on `#DDF3E8`, negative `#9A1B3A` on `#FDE7EC`.
- Type: Figtree 400/500/600/700. Big numbers 60/34 px, weight 700, tracking −0.02 to −0.03 em.
- Layout: left sidebar (white card, 220 px, icon + label nav) + main column; cards radius 24 px, no borders, no shadows; generous 20 px gaps.
- Chart libraries (suggestion, agent decides): shadcn/ui charts (+ ECharts for complex types). Charts skin: single blue line 3 px, 10% blue area, very light grid, rounded line joins, round end dot. Tooltips are white cards.
- Signature: headline sentences that summarize each page in plain language.

## 2. Cobalt Field — `apps/web-cobalt` · ref `2-cobalt-field.html`

Mood: bold, confident, editorial. The whole app sits on saturated cobalt.

- Colors: field `#1535E8`, deep panel `#0E24B8`, darker `#0A1FA8`, white `#FFFFFF`, muted on blue `#BFCBFF`, divider `#4A63F0`. Semantic: up/down shown with ▲▼ glyphs + white/`#BFCBFF` weight, never red/green on blue.
- Type: Bricolage Grotesque 400/600/800 for display and UI; Geist Mono for labels, dates and tables. Hero number up to 220 px, tracking −0.06 em.
- Layout: top nav, giant hero number, pill-shaped KPI capsules (filled white or white outline), large rounded panels (radius 28 px) in deep cobalt.
- Chart libraries (suggestion, agent decides): ApexCharts (+ ECharts for complex types). Charts skin: white lines 3–3.5 px, 14% white area, no grid or a single faint baseline; axis text in `#BFCBFF` mono.
- Signature: oversized numerals as layout elements; inverse white cards for the most important secondary metric.

## 3. Dot Matrix — `apps/web-matrix` · ref `3-dot-matrix.html`

Mood: precise instrument panel with a printed, dotted texture. Light, crisp, square.

- Colors: ground `#E6E9EE` with a 16 px dot grid (`#B9BFC9`), panel `#F7F8FA`, ink `#0C0D10`, muted `#4B525C`, display screen `#0C0D10` with signal `#3DDCC4` and screen-muted `#9AA2AF`.
- Type: Doto (dot-matrix) 700/900 for big numbers and the wordmark only; Geist for UI; Geist Mono for labels (uppercase, +0.08 em).
- Layout: square corners everywhere, 1 px solid ink borders, dashed row dividers, segmented square nav buttons, one black "screen" panel per page for the hero metric.
- Chart libraries (suggestion, agent decides): Apache ECharts for everything. Charts skin: 2–2.5 px ink line, dotted-pattern area fills (SVG pattern), step-style where data is daily, square markers, mono axis labels.
- Signature: dot-matrix numerals on the black screen; dot-pattern fills.

## 4. Platinum Rail — `apps/web-platinum` · ref `4-platinum-rail.html`

Mood: premium dark private-banking terminal. Cool steel, restrained.

- Colors: ground `#12151B`, rail `#0D1015`, panel `#1A1F27`, border `#232933`, chip border `#2F3744`, text `#F1F4F8`, muted `#8C97A8`, silver line `#C9D1DB`, accent `#8FB4FF`, alert `#FF8FA3`.
- Type: Outfit 300/400/500/600 — light 300 for big numbers with a white→`#9AA6B8` vertical gradient fill; Geist Mono for data.
- Layout: 76 px icon rail on the left (icon buttons 46 px, active tile `#232933`), breadcrumb header ("Market / ONyc"), panels radius 22 px with 1 px border.
- Chart libraries (suggestion, agent decides): Tremor (+ ECharts for complex types). Charts skin: silver 2.5 px line, 10% `#8FB4FF` area, faint `#232933` grid, metallic gradient bars (`#C9D1DB → #5F6A7C`), progress rings only for single ratios.
- Signature: thin light numerals with metallic gradient; ring progress for supply/collateral ratios.

## 5. Pastel Blocks — `apps/web-pastel` · ref `5-pastel-blocks.html`

Mood: friendly, modern, colorful but calm. White page, soft color blocks, sentence-first.

- Colors: page `#FFFFFF`, ink `#101426`, muted `#44506B`, neutral block `#F3F5F9`, nav chip `#EEF1F6`; blocks: sky `#CFE3FF`, mint `#CDEFE0`, lilac `#E1D9FF`, rose `#FAD4E4`, butter `#FFE9A8`; dark block `#101426` (text white, muted `#B7C0DA`); negative text `#9A1B3A`.
- Type: Onest 400–800. Page headline is a sentence with highlighted values in pastel pills (58 px, weight 800).
- Layout: 3-column masonry of rounded blocks (radius 30 px), each block one pastel color by topic (NAV = sky, yield = mint, capital = rose, points = lilac, fees/costs = butter). Rounded chip nav.
- Chart libraries (suggestion, agent decides): ApexCharts or Tremor, chosen after the Phase 3 spike (+ ECharts for complex types). Charts skin: thick 3.5 px ink lines on pastel, ink bars with rounded tops, no grid, big direct labels instead of legends.
- Signature: color = topic, consistently across all pages.

---

## Shared UX rules

- Loading: skeletons shaped like the final content. Empty: say what will appear and why it's empty. Error: what failed (source) and that the last good value is shown.
- Every KPI: value, change, period, source, age.
- Numbers right-aligned in tables; tabular numerals.
- Phone width works on every page (≥ 360 px); nav collapses appropriately for each direction.
- Footer disclaimer on every page.
