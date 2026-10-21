# ONyc Terminal — project rules for Claude Code

Read these before every task. Full context lives in `docs/`.

- `docs/SPEC.md` — what we build, page by page, and every metric formula
- `docs/DATA_SOURCES.md` — verified upstream endpoints, shapes, cadences, known conflicts
- `docs/ARCHITECTURE.md` — monorepo, DB schema, worker jobs, API routes, deploy
- `docs/CHARTS.md` — chart libraries per app, chart catalogue, skin rules (no default themes)
- `docs/DESIGN.md` + `design/refs/*.html` — five visual directions, one app each

## Non-negotiables

1. **Real data only.** Never hard-code or invent numbers, formulas, endpoints or fields. If a value can't be derived from a source, show "not available" and say why.
2. **Verify before you build on a source.** Call the endpoint, save the raw response as a fixture, write the zod schema from it.
3. **Every number carries source + timestamp** through the API to the UI.
4. **Read-only product.** No transactions, no signing, no custody. Link out for actions.
5. **Five separate frontends.** Shared: `sdk`, `chart-specs` (data + annotations), `charts-echarts` (complex chart types, themed per app), `format`. Not shared: layouts, components, styling. Each must match its reference in `design/refs/` and DESIGN.md.
6. **Modern charts from well-known libraries, never default-themed.** Each app may mix any well-known libraries chart by chart (shadcn/ui charts, Tremor, Recharts, ApexCharts, ECharts, Plot, Visx, Nivo…); CHARTS.md only suggests a starting point and you decide after the Phase 3 spike. Always apply the app's skin (colors, fonts, line weight, tooltip); never ship a library's default look. No pie/donut charts. It must look like a current fintech product, not a dated report.
7. **No AI-slop styling.** No cream/serif/terracotta, no purple-blue gradients, no Inter/Space Grotesk, no emoji icons, no glow.
8. **Tests:** every function in `packages/metrics` and every parser in `packages/sources` has unit tests on fixtures. Run `pnpm typecheck && pnpm test` before saying a phase is done.
9. **Secrets** only from env. Never commit keys. The app must run without optional keys (Helius, Telegram) and show "not configured".
10. Be polite to upstreams: cache, back off, respect rate limits, identify with a User-Agent.
11. Unofficial: footer disclaimer on every page; no OnRe logos or brand assets; name is "ONyc Terminal".

## Working style

- Work phase by phase (see PROMPT.md). At the end of each phase: run checks, list what was verified live, list open questions. Don't skip ahead.
- When the docs and reality disagree (an endpoint changed, a field is missing), reality wins: update `docs/DATA_SOURCES.md` in the same commit and note it.
- Small commits with clear messages.
