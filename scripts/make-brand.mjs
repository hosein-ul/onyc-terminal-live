#!/usr/bin/env node
// Writes each app's favicon (SVG) and social image (PNG, 1200x630) from its own tokens and fonts.
// The mark is the same computed rising line in every app (an ease-out curve), set in that direction's colours; it is a
// community mark, not the OnRe logo. Usage: node scripts/make-brand.mjs [app...]   (default: all five)
import { createRequire } from "node:module";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const line = Array.from({ length: 7 }, (_, i) => {
  const t = i / 6;
  return `${(7 + t * 16).toFixed(1)},${(22 - (1 - (1 - t) ** 2) * 13).toFixed(1)}`;
}).join(" ");

const fontFace = (app, pkg, weight, family) =>
  `@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(`apps/web-${app}/node_modules/@fontsource/${pkg}/files/${pkg}-latin-${weight}-normal.woff2`).toString("base64")}) format("woff2")}`;

const apps = {
  calm: {
    mark: (s) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 30 30"><rect width="30" height="30" rx="10" fill="#0B6BCB"/><polyline points="${line}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="9" r="2.4" fill="#fff"/></svg>`,
    fonts: () =>
      fontFace("calm", "figtree", 500, "Figtree") + fontFace("calm", "figtree", 700, "Figtree"),
    page: (mark) =>
      `body{background:#EEF2F6;font-family:Figtree;color:#101828;padding:0 96px}.card{background:#fff;border-radius:48px;padding:64px 72px;width:100%;display:flex;align-items:center;gap:48px}h1{font-size:76px;line-height:1.05;letter-spacing:-.03em;margin:0 0 16px;font-weight:700}p{font-size:30px;color:#475467;margin:0;font-weight:500}.mark svg{width:168px;height:168px}</style><div class="card"><div class="mark">${mark(168)}</div><div><h1>ONyc Terminal</h1><p>Unofficial, read-only analytics for ONyc. Every number shows its source and age.</p></div></div>`,
  },
  platinum: {
    mark: (s) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 30 30"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E3E9F1"/><stop offset="1" stop-color="#8C97A8"/></linearGradient></defs><rect width="30" height="30" rx="9" fill="url(#g)"/><polyline points="${line}" fill="none" stroke="#12151B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="9" r="2.3" fill="#12151B"/></svg>`,
    fonts: () =>
      fontFace("platinum", "outfit", 300, "Outfit") + fontFace("platinum", "outfit", 400, "Outfit"),
    page: (mark) =>
      `body{background:#12151B;font-family:Outfit;color:#F1F4F8;padding:0 96px}.card{background:#1A1F27;border:1px solid #232933;border-radius:44px;padding:64px 72px;width:100%;display:flex;align-items:center;gap:48px}h1{font-size:84px;line-height:1.05;letter-spacing:-.02em;margin:0 0 16px;font-weight:300;color:#C9D1DB}p{font-size:30px;color:#8C97A8;margin:0;font-weight:400}.mark svg{width:168px;height:168px}</style><div class="card"><div class="mark">${mark(168)}</div><div><h1>ONyc Terminal</h1><p>Unofficial, read-only analytics for ONyc. Every number shows its source and age.</p></div></div>`,
  },
  cobalt: {
    mark: (s) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 30 30"><circle cx="15" cy="15" r="15" fill="#fff"/><polyline points="${line}" fill="none" stroke="#1535E8" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    fonts: () =>
      fontFace("cobalt", "bricolage-grotesque", 600, "Bricolage Grotesque") +
      fontFace("cobalt", "bricolage-grotesque", 800, "Bricolage Grotesque"),
    page: (mark) =>
      `body{background:#1535E8;font-family:"Bricolage Grotesque";color:#fff;padding:0 80px}.row{display:flex;align-items:center;gap:40px;width:100%}h1{font-size:132px;line-height:.9;letter-spacing:-.05em;margin:0 0 20px;font-weight:800}p{font-size:32px;color:#BFCBFF;margin:0;font-weight:600}.mark svg{width:150px;height:150px}</style><div class="row"><div class="mark">${mark(150)}</div><div><h1>onyc terminal</h1><p>Unofficial, read-only analytics for ONyc.</p></div></div>`,
  },
  matrix: {
    mark: (s) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 30 30"><rect width="30" height="30" fill="#0C0D10"/><polyline points="${line}" fill="none" stroke="#3DDCC4" stroke-width="2.4" stroke-linejoin="miter"/><rect x="21.6" y="7.6" width="3" height="3" fill="#3DDCC4"/></svg>`,
    fonts: () =>
      fontFace("matrix", "doto", 900, "Doto") + fontFace("matrix", "geist-mono", 400, "Geist Mono"),
    page: (mark) =>
      `body{background:#E6E9EE;background-image:radial-gradient(#B9BFC9 1px,transparent 1.2px);background-size:16px 16px;font-family:"Geist Mono";color:#0C0D10;padding:0 80px}.screen{background:#0C0D10;width:100%;padding:56px 64px}h1{font-family:Doto;font-weight:900;font-size:120px;line-height:1;margin:0 0 18px;color:#3DDCC4;letter-spacing:.02em}p{font-size:26px;color:#9AA2AF;margin:0;text-transform:uppercase;letter-spacing:.06em}</style><div class="screen"><h1>ONYC.TERMINAL</h1><p>Unofficial, read-only analytics for ONyc</p></div>`,
  },
  pastel: {
    mark: (s) =>
      `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 30 30"><rect x="2" y="2" width="26" height="26" rx="9" fill="#CFE3FF" stroke="#101426" stroke-width="2"/></svg>`,
    fonts: () =>
      fontFace("pastel", "onest", 700, "Onest") + fontFace("pastel", "onest", 800, "Onest"),
    page: () =>
      `body{background:#fff;font-family:Onest;color:#101426;padding:0 88px}h1{font-size:88px;line-height:1.08;letter-spacing:-.035em;margin:0;font-weight:800}mark{background:#CFE3FF;padding:0 14px;border-radius:22px}mark.m{background:#CDEFE0}p{font-size:30px;color:#44506B;margin:28px 0 0;font-weight:700}</style><div><h1>onyc terminal: <mark>read-only</mark> analytics, <mark class="m">sourced</mark> and dated.</h1><p>Unofficial. Not affiliated with OnRe.</p></div>`,
  },
};

const only = process.argv.slice(2);
const names = only.length > 0 ? only : Object.keys(apps);

const pw = createRequire(join(homedir(), ".claude/design-studio/tools/noop.js"))("playwright");
const root = join(homedir(), "AppData/Local/ms-playwright");
const dir = readdirSync(root)
  .filter((x) => /^chromium-\d+$/.test(x))
  .sort()
  .pop();
const browser = await pw.chromium.launch({
  executablePath: join(root, dir, "chrome-win64/chrome.exe"),
});

for (const name of names) {
  const a = apps[name];
  if (a === undefined) throw new Error(`unknown app ${name}`);
  mkdirSync(`apps/web-${name}/public`, { recursive: true });
  writeFileSync(`apps/web-${name}/public/favicon.svg`, `${a.mark(30)}\n`);
  const html = `<!doctype html><meta charset="utf-8"><style>${a.fonts()}*{box-sizing:border-box}html,body{margin:0}body{width:1200px;height:630px;display:flex;align-items:center;box-sizing:border-box}${a.page(a.mark)}`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `apps/web-${name}/public/og.png` });
  await page.close();
  console.log(`wrote apps/web-${name}/public/favicon.svg and og.png`);
}
await browser.close();
