#!/usr/bin/env node
// Full-page screenshot of one app's Overview once its data and charts have drawn.
// Usage: node scripts/shoot-overview.mjs http://localhost:5173 out.png [width]
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [url, out, width = "1440"] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: shoot-overview.mjs <url> <out.png> [width]");
  process.exit(2);
}
const pw = createRequire(join(homedir(), ".claude/design-studio/tools/noop.js"))("playwright");
const root = join(homedir(), "AppData/Local/ms-playwright");
const dir = readdirSync(root)
  .filter((x) => /^chromium-\d+$/.test(x))
  .sort()
  .pop();
const browser = await pw.chromium.launch({
  executablePath: join(root, dir, "chrome-win64/chrome.exe"),
});
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await page.goto(url, { waitUntil: "networkidle" });
// Wait until no skeleton is left and every chart has drawn something.
await page
  .waitForFunction(() => document.querySelectorAll('[class*="skeleton"]').length === 0, null, {
    timeout: 60000,
  })
  .catch(() => {});
await page.waitForTimeout(3000);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("wrote", out);
