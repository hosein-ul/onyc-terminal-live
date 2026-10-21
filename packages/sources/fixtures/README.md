# Fixtures

Raw responses saved from the live upstreams on 2026-10-21 (see `docs/DATA_SOURCES.md` §8). Tests parse these with
the real zod schemas; they are never edited by hand. To refresh one, call the endpoint again and overwrite the file,
then update any test that asserts a value from it.

- `defillama_yields_onyc.json` is the ONyc-only subset of the 11 MB `yields.llama.fi/pools` payload.
- `defillama_protocol_onre.json` keeps only the TVL series and chain totals of `api.llama.fi/protocol/onre`.
- `rewards_leaderboard_page0_size250.json` and `..._size50.json` are public leaderboard pages (public wallet addresses).
