# Assets

Logos and icons shown for identification only. They are fetched once by `scripts/fetch-assets.mjs` (never at runtime),
self-hosted under `apps/web-calm/public/assets/` and listed in `apps/web-calm/src/assets/manifest.json`. Every image
has alt text in the app, and a name with no image gets a generated monogram badge.

The ONyc token icon is the image in the token's own metadata. Third-party protocol logos belong to their owners and are
used to say which protocol a number belongs to. No OnRe marketing logo, wordmark or site artwork is used (CLAUDE.md rule 11).

| Kind | Key | File | Source URL | Where it comes from |
| --- | --- | --- | --- | --- |
| Token | onyc | `apps/web-calm/public/assets/tokens/onyc.png` | https://arweave.net/PyZzfGP-CqzaVlxTU3sb-I5uv4ZZKwnY8aCjcWn9S1A | OnRe /settings tokens[5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5].image |
| Token | usdc | `apps/web-calm/public/assets/tokens/usdc.png` | https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png | OnRe /settings tokens[EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v].image |
| Token | usdg | `apps/web-calm/public/assets/tokens/usdg.png` | https://424565.fs1.hubspotusercontent-na1.net/hubfs/424565/GDN-USDG-Token-512x512.png | OnRe /settings tokens[2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH].image |
| Token | usdt | `apps/web-calm/public/assets/tokens/usdt.svg` | https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg | OnRe /settings tokens[Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB].image |
| Token | pt-sronyc | `apps/web-calm/public/assets/tokens/pt-sronyc.svg` | https://cdn.exponent.finance/pt-tokens/PT-srONyc.svg | Jupiter token API, id BKP9Rt3pwh96cCoCp3bkh1zxXZpZez17xA6w64LuMJQy, field icon |
| Protocol | kamino | `apps/web-calm/public/assets/protocols/kamino.jpg` | https://icons.llama.fi/kamino.jpg | DefiLlama icon CDN |
| Protocol | exponent | `apps/web-calm/public/assets/protocols/exponent.png` | https://icons.llama.fi/exponent.png | DefiLlama icon CDN |
| Protocol | loopscale | `apps/web-calm/public/assets/protocols/loopscale.jpg` | https://icons.llama.fi/loopscale.jpg | DefiLlama icon CDN |
| Protocol | orca | `apps/web-calm/public/assets/protocols/orca.jpg` | https://icons.llama.fi/orca.jpg | DefiLlama icon CDN |
| Protocol | carrot | `apps/web-calm/public/assets/protocols/carrot.jpg` | https://icons.llama.fi/carrot.jpg | DefiLlama icon CDN |
| Protocol | jupiter | `apps/web-calm/public/assets/protocols/jupiter.jpg` | https://icons.llama.fi/jupiter.jpg | DefiLlama icon CDN |
| Protocol | accountable | `apps/web-calm/public/assets/protocols/accountable.jpg` | https://icons.llama.fi/accountable.jpg | DefiLlama icon CDN |
| Protocol | raydium | `apps/web-calm/public/assets/protocols/raydium.jpg` | https://icons.llama.fi/raydium.jpg | DefiLlama icon CDN |
| Protocol | ratex | `apps/web-calm/public/assets/protocols/ratex.jpg` | https://icons.llama.fi/ratex.jpg | DefiLlama icon CDN |

## Not found, drawn as a monogram

None.

Also drawn as monograms: Elemental, Solscan and Helius (DefiLlama has no icon for them), and srONyc and jrONyc (their mints are
not published in a source this tool trusts yet).

## Other artwork

- `apps/web-calm/src/assets/world.json`: country outlines from the Natural Earth data in the `world-atlas` package
  (public domain), converted to SVG paths by `scripts/build-map.mjs`.
- Peril icons are Lucide icons (ISC licence), the one icon set used across the app.
