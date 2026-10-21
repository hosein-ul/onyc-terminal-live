#!/usr/bin/env node
// Writes the Calm app's favicon (SVG) and social image (PNG). The mark is the same computed rising line as
// apps/web-calm/src/layout/Logo.tsx. Usage: node scripts/make-brand-calm.mjs
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const points = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6;
  return `${(7 + t * 16).toFixed(1)},${(22 - (1 - (1 - t) ** 2) * 13).toFixed(1)}`;
}).join(" ");

const mark = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 30 30"><rect width="30" height="30" rx="10" fill="#0B6BCB"/><polyline points="${points}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="9" r="2.4" fill="#fff"/></svg>`;

mkdirSync("apps/web-calm/public", { recursive: true });
writeFileSync("apps/web-calm/public/favicon.svg", `${mark(30)}\n`);

const font = (w) =>
  `@font-face{font-family:Figtree;font-weight:${w};src:url(data:font/woff2;base64,${readFileSync(`apps/web-calm/node_modules/@fontsource/figtree/files/figtree-latin-${w}-normal.woff2`).toString("base64")}) format("woff2")}`;
const html = `<!doctype html><meta charset="utf-8"><style>${font(500)}${font(700)}
html,body{margin:0}
body{width:1200px;height:630px;background:#EEF2F6;font-family:"Figtree",Arial,sans-serif;color:#101828;display:flex;align-items:center;padding:0 96px;box-sizing:border-box}
.card{background:#fff;border-radius:48px;padding:64px 72px;width:100%;display:flex;align-items:center;gap:48px}
h1{font-size:76px;line-height:1.05;letter-spacing:-.03em;margin:0 0 16px;font-weight:700}
p{font-size:30px;color:#475467;margin:0;font-weight:500}
.mark svg{width:168px;height:168px}
</style><div class="card"><div class="mark">${mark(168)}</div><div><h1>ONyc Terminal</h1><p>Unofficial, read-only analytics for ONyc. Every number shows its source and age.</p></div></div>`;

const pw = createRequire(join(homedir(), ".claude/design-studio/tools/noop.js"))("playwright");
const root = join(homedir(), "AppData/Local/ms-playwright");
const dir = readdirSync(root)
  .filter((x) => /^chromium-\d+$/.test(x))
  .sort()
  .pop();
const browser = await pw.chromium.launch({
  executablePath: join(root, dir, "chrome-win64/chrome.exe"),
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.waitForTimeout(500);
await page.screenshot({ path: "apps/web-calm/public/og.png" });
await browser.close();
console.log("wrote apps/web-calm/public/favicon.svg and og.png");
