# Chart system — libraries, specs and catalogue

The owner wants a **modern, industry-standard fintech look**, not dated "government report" charts, and wants to use
**several well-known, user-friendly chart libraries** rather than build charts from scratch. Different apps may use different libraries.

## Libraries and who uses what

**The agent decides.** Any app may use **any mix of well-known libraries, chart by chart**: shadcn/ui charts, Tremor, Recharts,
ApexCharts, Apache ECharts, Observable Plot, Visx, uPlot, Nivo, Highcharts (check its license before using), or others,
whichever gives the best look and behavior for that specific chart in that app's direction. The table below is only a
**starting suggestion** from the owner; run the Phase 3 spike (see PROMPT.md), compare screenshots, and use your judgment.
Keep each app to a small number of libraries (aim for 2–3) so the bundle stays reasonable and the look stays coherent inside the app.
Sankey, treemap/icicle, calendar heatmap, Gantt, Lorenz and 25k-point scatter are easiest in **Apache ECharts**.

| App | Suggested starting point | Why |
|---|---|---|
| Calm Fintech | **shadcn/ui charts** (Recharts under the hood) | soft rounded cards, light tooltips, friendly fintech look |
| Cobalt Field | **ApexCharts** | bold lines, smooth animation, easy dark-on-color theming |
| Dot Matrix | **Apache ECharts** | step lines, pattern fills, calendar heatmap, square markers |
| Platinum Rail | **Tremor** (Recharts under the hood) | clean dark dashboard components, rings and bars |
| Pastel Blocks | **ApexCharts or Tremor** (pick after the spike) | rounded bars, direct labels, soft colors |

Other allowed helpers: **Observable Plot / Visx** for small multiples and sparklines; **d3-scale / d3-array / d3-format** for math;
a tiny hand-written SVG for something no library does well (e.g. a bullet meter).
Not recommended: Chart.js (looks dated), unless a specific chart type needs it.

## Rules that stay

- **Never ship a library's default theme.** Every chart is styled through the app's `skin` (colors, fonts, line weight, radius, grid, tooltip). Libraries are welcome; unstyled defaults are not.
- Each app has a thin adapter folder `apps/web-*/src/charts/` that maps our shared **chart specs** (data + annotations + units, defined in `packages/chart-specs`) to whichever libraries that app uses. The data shaping, annotations (events, thresholds), units and source/age footer logic live once in `packages/chart-specs`; only the drawing differs per app.
- One shared ECharts layer `packages/charts-echarts` for the complex types, exposing `makeTheme(tokens)`.
- **Render:** canvas for dense data (leaderboard ~25k points, series > 5k points), SVG otherwise.
- **Theme:** every chart takes a `skin` object (colors, stroke widths, fills, fonts, grid style, marker shapes, corner radius, motion). Each web app defines its own skin from its tokens (see DESIGN.md). Charts never hard-code a color.

## Primitives (build these first, with a gallery page in each app at `/_charts`)

`ChartFrame` (title, subtitle, source + age footer, range control, export menu, "show as table" toggle, loading / empty / stale / error states) ·
`Axis` (smart ticks, tabular numerals, unit-aware formatting from `packages/format`) ·
`Gridlines` · `Crosshair` (synced across charts on the same page via a shared hover store) ·
`Tooltip` (positioned, keyboard reachable) · `Annotation` (event marker with label, collision-avoiding) ·
`Brush` (range selection) · `Legend` (interactive, series toggle) · `ThresholdBand`.

## Chart catalogue (each maps to a page in SPEC.md)

| Chart | Used for | Notes |
|---|---|---|
| Line + area with event markers | NAV, market price, supply | end-point dot + value label, area fill from skin |
| Dual line + spread band | market price vs NAV | band shaded by premium/discount sign; ±bps threshold bands |
| Diverging bar | premium/discount bps per day | |
| Waterfall | AUM change = NAV effect + flow effect + residual | |
| Stacked area (absolute and 100%) | capital by protocol over time | 7 series, ordered by size, labels at right edge instead of a legend |
| Stack bar (single bar) | capital stack: bound / available / liquidity = AUM | sum check annotation |
| Treemap / icicle | reserves by venue → asset; capital by protocol | prefer icicle for 2 levels; no pie/donut charts anywhere |
| Gantt timeline | reinsurance layers inception → renewal | today line, color by structure, hover shows layer |
| Bubble scatter | layer expected yield vs expected loss ratio, bubble = capital | quadrant guides |
| Bar by month | capital rolling off per renewal month | |
| Calendar heatmap | daily NAV increment ppm, daily points emission | GitHub-style but with the app's own cell shape |
| Lorenz curve | points concentration | with Gini readout and equality line |
| Ranked bar with sparkline | leaderboard rows, venue mix | |
| Scatter (log x) | DeFi opportunities APY vs TVL | point shape by classification |
| Bullet / meter | liquidity coverage vs 15% target, collateral ratio vs 100% | horizontal, not a radial gauge |
| Sankey | AUM → bound / available / liquidity → asset groups | |
| Sparkline | KPI strip | min/max markers optional |
| Small multiples | per-opportunity APY history | shared y-scale toggle |

## Interaction and quality rules

- Range control (1W 1M 3M 1Y ALL) on every time series; URL-synced.
- Hover crosshair syncs across all time charts on a page.
- Keyboard: arrow keys move the crosshair; Enter pins a tooltip.
- Every chart has an accessible table view and an `aria-label` summary generated from data.
- Export: PNG (rendered with the skin) and CSV of the exact data shown.
- Numbers: `tabular-nums`, sensible precision (NAV 4–6 dp, USD compact $282.8M, bps integer, % 2 dp).
- Motion: enter transitions ≤ 300 ms, respect `prefers-reduced-motion`. No bouncy springs, no animated gradients.
- Responsive: charts reflow to phone width; complex charts (Gantt, Sankey) scroll horizontally inside their frame.
- Performance: memoize scales; virtualize long tables; canvas for > 5k marks.
- Source footer is mandatory: "Source: OnRe core API · updated 42 s ago".

---

## Phase 3 spike result (2026-10-21)

**Method.** A throwaway playground (`spike/`, deleted once the decision was recorded) drew the NAV hero chart (511 daily points, four
down-tick markers, end dot and value label) and the capital stacked area (7 protocols, 90 days) in four libraries, from the
live `/v1/nav` and `/v1/capital/distribution` responses, in the Calm and Platinum skins. Screenshots:
`docs/spike/spike-calm.png`, `docs/spike/spike-platinum.png`.

| Library | Skinning | Annotations | Keyboard | Bundle (gzip, these two charts) | Verdict |
|---|---|---|---|---|---|
| shadcn/ui pattern over Recharts 3 | Full: reads CSS variables directly, so one set of tokens skins it | Reference dots and labels worked | Built in: the SVG is focusable and arrow keys move the tooltip | 126 KB | **Use** for ordinary time series, bars and sparklines |
| Tremor 3 | Weak. Needs Tailwind 3 and colour names mapped through a safelist; forces a gradient fill on every stacked layer; y labels clipped at 4 digits; line weight fixed thin | None: no reference points, no end label, so no event markers | None | 256 KB | **Drop** |
| ApexCharts 5 | Good, but colours must be literal values, so tokens are resolved in JS | Worked; the end label clipped at the right edge | Focusable | 185 KB | **Drop**: heavier than Recharts, no advantage in any chart, a second library next to ECharts |
| ECharts 6 | Full, through `makeTheme(tokens)` | Mark points, mark lines and areas worked | None built in; we add arrow keys through `dispatchAction` | 203 KB (line only, SVG + canvas renderers; grows about 10 KB per extra chart type) | **Use** for everything the catalogue marks as complex |

Other findings:
- Tremor 3 pins React 18 and Tailwind 3. Dropping it frees the apps to use current React and plain CSS with token variables.
- Apex and ECharts cannot read `var(--token)`, so `charts-echarts` resolves tokens to literals in `makeTheme(tokens)`.
- Smooth curves hide the day-step nature of NAV; the NAV chart uses straight segments, not smoothing.
- NAV down-ticks are visible as markers in every library that supports annotations.

### Decision per app (owner override, 2026-10-21)

The spike recommended Recharts + ECharts and dropping Tremor and ApexCharts. The owner chose **Tremor and shadcn/ui charts**
as the main libraries, so the decision is:

| App | Main libraries | Complex charts | Notes |
|---|---|---|---|
| web-calm | shadcn/ui charts | ECharts | white tooltip cards, 3 px line, 10% area |
| web-cobalt | shadcn/ui charts | ECharts | white lines on cobalt, mono axis text |
| web-matrix | ECharts | ECharts | pattern fills, step lines and square markers are easiest there |
| web-platinum | Tremor (simple charts) + shadcn/ui charts (annotated charts) | ECharts | rings and bar lists are plain SVG |
| web-pastel | Tremor (bars, simple areas) + shadcn/ui charts (annotated charts) | ECharts | rounded-top bars, direct labels |

Rules that follow from the spike:
- **Tremor is used only where it can be fully skinned**: plain area/line/bar charts, sparklines, bar lists. Any chart that needs
  event markers, an end-point label or direct labels (NAV hero, capital stack) uses shadcn/ui charts, because Tremor 3 has no
  annotation API.
- Tremor 3 needs Tailwind 3 and React 18, so only apps that use it (web-platinum, web-pastel) carry Tailwind 3 and React 18;
  the other apps may use a newer React. Tremor colours map to the skin through a safelisted Tailwind theme (see
  `spike/tailwind.config.js`, copied into each such app), and its forced gradient fills are overridden with CSS.
- ApexCharts is not used. At most three libraries in one app (shadcn/ui charts, Tremor, ECharts).
- Cobalt and Matrix were not rendered in the spike; Phase 5 revisits them if a chart needs something their library cannot do.

---

## Phase 3 implementation (2026-10-21)

**Packages**
- `@onyc/chart-specs`: library-agnostic specs (`timeseries`, `stacked`, `bars`, `stackbar`, `bullet`, `scatter`, `calendar`,
  `lorenz`, `gantt`, `treemap`, `sankey`, `waterfall`, `multiples`), one builder per catalogue chart that takes the whole
  `{ data, meta }` API response, `provenanceFrom` (oldest fetch wins), `formatValue`/`axisFormatter`, `specToTable` and
  `specToCsv`. A browser-only entry `@onyc/chart-specs/dom` has PNG export (`svgToPng`: copies computed style onto the SVG and embeds
  the app's fonts so the picture matches the screen), CSV/PNG download and the reduced-motion check. 32 tests on real saved API
  responses (`packages/chart-specs/fixtures/`).
- `@onyc/charts-echarts`: `makeTheme(tokens)`, `optionFor(spec, { tokens, motion })` for scatter/bubble, calendar heatmap, Lorenz, Gantt,
  treemap, sankey and waterfall, and `createEchart(el, spec, tokens)`, which adds resize, `prefers-reduced-motion`, an `aria-label` made
  from the spec summary, and keyboard stepping (arrows, Home/End, Enter pins the tooltip, Escape releases). Treemap and sankey have no
  reliable tooltip action in ECharts, so for them the table view is the keyboard path. Tokens are read from `--chart-*` CSS variables.
  `onColor` picks the better of ink and surface for text on a fill by contrast ratio. 10 tests.

**Per app** (`apps/web-calm`, `apps/web-platinum`; the other three get theirs in Phase 5)
- `src/tokens.css` defines the app's tokens and the `--chart-*` skin; `src/charts/` holds that app's own frame, tooltip, crosshair store and
  adapters. Nothing in `src/charts/` is shared between apps except through the two packages above.
- Calm: Recharts for time series, stacked area and bars; SVG for the capital stack bar and the bullet meters; ECharts for the rest.
- Platinum: Tremor for simple vertical bars and ranked bar lists; Recharts for everything with annotations, thresholds or edge labels,
  and for sparklines; progress rings (plain SVG) for single ratios; ECharts for the rest.
- `/_charts` gallery in both: all 25 chart panels from the live API, range control synced to the URL, table toggle, PNG/CSV export.

**Findings during the build**
- Tremor's `SparkAreaChart` cannot turn its 1.5 s entry animation off, which breaks the 300 ms and reduced-motion rules, so Platinum draws
  sparklines with Recharts. Tremor charts have no keyboard crosshair; their table view is the accessible path.
- Calm's initial JS is about 227 KB gzip; Platinum's is about 423 KB because of Tremor. ECharts loads lazily, only on a page that shows a
  complex chart.
- Recharts 3 draws the SVG with `accessibilityLayer`, so the chart is focusable and the arrow keys move the tooltip with no extra code.
- Charts where the API has no history yet (market premium, opportunity APY history, 30-day premium) show an explicit "collecting since"
  empty state instead of a stub line.

**Verification**: `scripts/verify-charts.mjs <url>` drives a real browser against a gallery: footers on every chart, keyboard crosshair
(Recharts and ECharts), table view, CSV export (line count equals table rows), PNG export (valid image), range control in the URL,
no console errors, reduced motion. 9/9 pass on both apps. Phone width (390 px, touch emulation): no horizontal overflow; Gantt, sankey
and calendar keep a minimum width and scroll sideways inside their frame. Screenshots: `docs/spike/gallery-*.png`, `docs/spike/mobile-*.png`.
