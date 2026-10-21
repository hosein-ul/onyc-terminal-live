#!/usr/bin/env node
// Opens every page of one web app on desktop (1440 px) or on an emulated phone (390 px, touch, dpr 2) with reduced motion, saves a
// full-page PNG per page, and reports console errors, horizontal overflow, leftover skeletons and error banners.
// Usage: node scripts/sweep-pages.mjs http://localhost:5173 out-dir [mobile]
import { createRequire } from "node:module";
import { mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [base, outDir, mode = "desktop"] = process.argv.slice(2);
if (!base || !outDir) {
  console.error("usage: sweep-pages.mjs <base-url> <out-dir> [mobile]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

let pw;
for (const dir of [process.cwd(), join(homedir(), ".claude", "design-studio", "tools")]) {
  try {
    pw = createRequire(join(dir, "noop.js"))("playwright");
    break;
  } catch {
    /* try the next location */
  }
}
if (!pw) throw new Error("playwright not found");
let browser;
try {
  browser = await pw.chromium.launch();
} catch {
  const root = join(homedir(), "AppData/Local/ms-playwright");
  const d = readdirSync(root)
    .filter((x) => /^chromium-\d+$/.test(x))
    .sort()
    .pop();
  browser = await pw.chromium.launch({ executablePath: join(root, d, "chrome-win64/chrome.exe") });
}

const pages = [
  ["overview", "/"],
  ["nav", "/nav"],
  ["market", "/market"],
  ["reinsurance", "/reinsurance"],
  ["capital", "/capital"],
  ["points", "/points"],
  ["wallet", "/wallet"],
  ["wallet-result", "/wallet/DTjNdfYmKpwGjnX6UPGvxwXQ7PZEGM7M43BQLtyASnvh"],
  ["risk", "/risk"],
  ["health", "/health"],
  ["activity", "/activity"],
  ["developers", "/developers"],
];
const ctx = await browser.newContext({
  reducedMotion: "reduce",
  ...(mode === "mobile"
    ? {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      }
    : { viewport: { width: 1440, height: 900 } }),
});
let bad = 0;
for (const [name, path] of pages) {
  const p = await ctx.newPage();
  const errors = [];
  p.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text().slice(0, 160));
  });
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await p.goto(base + path);
  await p.waitForTimeout(6500);
  const m = await p.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    skeletons: document.querySelectorAll(".ch-skeleton,.skel").length,
    banners: [...document.querySelectorAll(".ch-banner-bad,.notice-bad")].map((x) =>
      x.textContent.slice(0, 80),
    ),
  }));
  await p.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  const ok = !m.overflow && m.skeletons === 0 && m.banners.length === 0 && errors.length === 0;
  if (!ok) bad += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(14)} ${JSON.stringify({ ...m, errors })}`);
  await p.close();
}
await browser.close();
process.exit(bad === 0 ? 0 : 1);
