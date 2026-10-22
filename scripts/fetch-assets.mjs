#!/usr/bin/env node
// Downloads the logos and token icons the app shows, self-hosts them under apps/web-calm/public/assets and writes
// apps/web-calm/src/assets/manifest.json and docs/ASSETS.md. Run it at build or ingest time, never at runtime:
//   node scripts/fetch-assets.mjs
// Sources: token icons from OnRe's /settings token metadata (the image field of each mint) and Jupiter's token API;
// protocol logos from DefiLlama's icon CDN. Nothing is fetched from OnRe's marketing site. A missing logo is left out
// of the manifest and the app draws a generated monogram badge for it.
import { mkdirSync, writeFileSync } from "node:fs";
import { extname } from "node:path";

const root = new URL("../", import.meta.url);
const outDir = new URL("apps/web-calm/public/assets/", root);
const UA = { "user-agent": "onyc-terminal/0.1 (independent, read-only)" };

const MINTS = {
  onyc: "5Y8NV33Vv7WbnLfq3zBcKSdYPrk7g2KoiQoe7M2tcxp5",
  usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  usdg: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
  usdt: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  "pt-sronyc": "BKP9Rt3pwh96cCoCp3bkh1zxXZpZez17xA6w64LuMJQy",
};

// DefiLlama icon names (https://icons.llama.fi/<name>.jpg or .png).
const PROTOCOLS = {
  kamino: "kamino",
  exponent: "exponent",
  loopscale: "loopscale",
  orca: "orca",
  carrot: "carrot",
  jupiter: "jupiter",
  accountable: "accountable",
  raydium: "raydium",
  ratex: "ratex",
};

const manifest = { tokens: {}, protocols: {} };
const sources = [];

async function get(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res;
}

async function save(group, key, url, note) {
  const res = await get(url);
  const bytes = Buffer.from(await res.arrayBuffer());
  // Some hosts (Arweave) send no content type, so the file's own first bytes decide.
  const sniff = bytes.subarray(0, 4).toString("hex").startsWith("89504e47")
    ? "image/png"
    : bytes.subarray(0, 2).toString("hex") === "ffd8"
      ? "image/jpeg"
      : bytes.subarray(0, 3).toString("latin1") === "GIF"
        ? "image/gif"
        : bytes.subarray(0, 4).toString("latin1") === "RIFF"
          ? "image/webp"
          : bytes.subarray(0, 200).toString("utf8").includes("<svg")
            ? "image/svg+xml"
            : "";
  const header = res.headers.get("content-type") ?? "";
  const type = header.startsWith("image/") ? header : sniff;
  if (!type.startsWith("image/")) throw new Error(`not an image: ${header || "no type"} ${url}`);
  const ext = type.includes("svg")
    ? ".svg"
    : type.includes("png")
      ? ".png"
      : type.includes("webp")
        ? ".webp"
        : type.includes("gif")
          ? ".gif"
          : ".jpg";
  const dir = new URL(`${group}/`, outDir);
  mkdirSync(dir, { recursive: true });
  const file = `${key}${ext}`;
  writeFileSync(new URL(file, dir), bytes);
  manifest[group][key] = `/assets/${group}/${file}`;
  sources.push({ group, key, file: `apps/web-calm/public/assets/${group}/${file}`, url, note });
  console.log("ok  ", group, key, ext);
}

// Token icons: OnRe's own token metadata first, Jupiter's token list for the rest.
const settings = await (await get("https://core.api.onre.finance/settings")).json();
for (const [key, mint] of Object.entries(MINTS)) {
  const meta = settings.tokens?.[mint];
  try {
    if (meta?.image) {
      await save("tokens", key, meta.image, `OnRe /settings tokens[${mint}].image`);
      continue;
    }
    const list = await (await get(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`)).json();
    const hit = list.find((t) => t.id === mint);
    if (hit?.icon) await save("tokens", key, hit.icon, `Jupiter token API, id ${mint}, field icon`);
    else console.log("miss", "tokens", key);
  } catch (error) {
    console.log("miss", "tokens", key, String(error).slice(0, 80));
  }
}

for (const [key, name] of Object.entries(PROTOCOLS)) {
  let done = false;
  for (const ext of ["png", "jpg"]) {
    try {
      await save("protocols", key, `https://icons.llama.fi/${name}.${ext}`, "DefiLlama icon CDN");
      done = true;
      break;
    } catch {
      // try the next extension
    }
  }
  if (!done) console.log("miss", "protocols", key);
}

mkdirSync(new URL("apps/web-calm/src/assets/", root), { recursive: true });
writeFileSync(
  new URL("apps/web-calm/src/assets/manifest.json", root),
  JSON.stringify(manifest, null, 2) + "\n",
);

const rows = sources.map(
  (s) =>
    `| ${s.group === "tokens" ? "Token" : "Protocol"} | ${s.key} | \`${s.file}\` | ${s.url} | ${s.note} |`,
);
const missing = [
  ...Object.keys(PROTOCOLS)
    .filter((k) => !manifest.protocols[k])
    .map((k) => `${k} (protocol)`),
  ...Object.keys(MINTS)
    .filter((k) => !manifest.tokens[k])
    .map((k) => `${k} (token)`),
];
const doc = `# Assets

Logos and icons shown for identification only. They are fetched once by \`scripts/fetch-assets.mjs\` (never at runtime),
self-hosted under \`apps/web-calm/public/assets/\` and listed in \`apps/web-calm/src/assets/manifest.json\`. Every image
has alt text in the app, and a name with no image gets a generated monogram badge.

The ONyc token icon is the image in the token's own metadata. Third-party protocol logos belong to their owners and are
used to say which protocol a number belongs to. No OnRe marketing logo, wordmark or site artwork is used (CLAUDE.md rule 11).

| Kind | Key | File | Source URL | Where it comes from |
| --- | --- | --- | --- | --- |
${rows.join("\n")}

## Not found, drawn as a monogram

${missing.length === 0 ? "None." : missing.map((m) => `- ${m}`).join("\n")}

Also drawn as monograms: Elemental, Solscan and Helius (DefiLlama has no icon for them), and srONyc and jrONyc (their mints are
not published in a source this tool trusts yet).

## Other artwork

- \`apps/web-calm/src/assets/world.json\`: country outlines from the Natural Earth data in the \`world-atlas\` package
  (public domain), converted to SVG paths by \`scripts/build-map.mjs\`.
- Peril icons are Lucide icons (ISC licence), the one icon set used across the app.
`;
writeFileSync(new URL("docs/ASSETS.md", root), doc);
console.log("manifest written;", missing.length, "missing");
