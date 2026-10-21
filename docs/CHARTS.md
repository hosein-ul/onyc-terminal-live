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
