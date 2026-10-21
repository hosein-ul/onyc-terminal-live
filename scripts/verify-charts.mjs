#!/usr/bin/env node
// Browser check for the /_charts gallery of one app: keyboard crosshair, table view, CSV and PNG export, reduced motion,
// and that nothing logs an error. Usage: node scripts/verify-charts.mjs http://localhost:5173 [outdir]
// Playwright is resolved from the project, then from ~/.claude/design-studio/tools.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [base, outDir = "docs/spike/verify"] = process.argv.slice(2);
if (!base) {
  console.error("usage: verify-charts.mjs <base-url> [outdir]");
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

async function launch() {
  try {
    return await pw.chromium.launch();
  } catch {
    const root = join(homedir(), "AppData/Local/ms-playwright");
    const d = readdirSync(root)
      .filter((x) => /^chromium-\d+$/.test(x))
      .sort()
      .pop();
    return pw.chromium.launch({ executablePath: join(root, d, "chrome-win64/chrome.exe") });
  }
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
});
await page.goto(`${base}/_charts`);
await page.waitForSelector(".ch-frame .recharts-surface", { timeout: 20000 });
await page.waitForTimeout(4000);

// 1. Every frame has a footer with a source and an age.
const footers = await page.$$eval(".ch-foot", (els) => els.map((e) => e.textContent ?? ""));
check(
  "every chart has a source and age footer",
  footers.length >= 20 && footers.every((f) => /Source: .+ · (updated|update time)/.test(f)),
  `${footers.length} footers`,
);

// 2. Keyboard: focus the NAV chart, arrow keys show a tooltip with a date and value.
const nav = page.locator(".ch-frame").first();
const surface = nav.locator(".recharts-surface").first();
await surface.focus();
for (let i = 0; i < 6; i += 1) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const tipText = await page
  .locator(".ch-tip")
  .first()
  .textContent()
  .catch(() => null);
check(
  "keyboard arrows move the crosshair and show a tooltip (Recharts)",
  tipText !== null && /\d/.test(tipText),
  tipText ?? "no tooltip",
);

// 3. Keyboard on an ECharts chart (Gantt): arrows show a tooltip.
const gantt = page
  .locator(".ch-frame", { hasText: "Layers from inception" })
  .locator(".ch-echarts");
await gantt.scrollIntoViewIfNeeded();
await gantt.focus();
for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
const ganttTip = await gantt.locator("div[style*='position: absolute']").first().textContent();
await page.screenshot({ path: join(outDir, "echarts-keyboard.png") });
check(
  "keyboard arrows show a tooltip on an ECharts chart",
  /Capital: [$]/.test(ganttTip ?? ""),
  (ganttTip ?? "").slice(0, 60),
);

// 4. Table view shows the exact rows.
const frame = page.locator(".ch-frame", { hasText: "Where the capital sits" });
await frame.scrollIntoViewIfNeeded();
await frame.getByRole("button", { name: "Show as table" }).click();
const rows = await frame.locator(".ch-table tbody tr").count();
const cols = await frame.locator(".ch-table thead th").count();
check("table view lists the data", rows > 30 && cols >= 8, `${rows} rows, ${cols} columns`);
await frame.getByRole("button", { name: "Show as table" }).click();

// 5. CSV export matches the table.
await frame.getByRole("button", { name: "Export" }).click();
const [csvDl] = await Promise.all([
  page.waitForEvent("download"),
  frame.getByRole("menuitem", { name: "Download CSV" }).click(),
]);
const csvPath = join(outDir, csvDl.suggestedFilename());
await csvDl.saveAs(csvPath);
const csv = readFileSync(csvPath, "utf8").trim().split("\r\n");
check(
  "CSV export has a header and one line per table row",
  csv.length === rows + 1 && csv[0].startsWith("date,"),
  `${csv.length} lines, file ${csvDl.suggestedFilename()}`,
);

// 6. PNG export draws the chart.
await frame.getByRole("button", { name: "Export" }).click();
const [pngDl] = await Promise.all([
  page.waitForEvent("download"),
  frame.getByRole("menuitem", { name: "Download PNG" }).click(),
]);
const pngPath = join(outDir, pngDl.suggestedFilename());
await pngDl.saveAs(pngPath);
const png = readFileSync(pngPath);
const isPng = png.subarray(1, 4).toString() === "PNG";
check(
  "PNG export is a real image of reasonable size",
  isPng && statSync(pngPath).size > 20000,
  `${statSync(pngPath).size} bytes, ${isPng ? png.readUInt32BE(16) + "x" + png.readUInt32BE(20) : "not png"}`,
);

// 7. Range control is URL-synced.
await page.locator(".ch-range button", { hasText: "1Y" }).first().click();
await page.waitForTimeout(400);
check("range control is synced to the URL", page.url().includes("range=1y"), page.url());

check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await ctx.close();

// 8. Reduced motion: no chart animates (Recharts draws without dash animation).
const rctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const rpage = await rctx.newPage();
await rpage.goto(`${base}/_charts`);
await rpage.waitForSelector(".ch-frame .recharts-surface", { timeout: 20000 });
const animated = await rpage.evaluate(async () => {
  let seen = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 1500) {
    seen += document.querySelectorAll(
      ".recharts-line-curve[stroke-dasharray*='px'], .recharts-area-curve[stroke-dasharray*='px']",
    ).length;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return seen;
});
const motionPref = await rpage.evaluate(
  () => matchMedia("(prefers-reduced-motion: reduce)").matches,
);
check(
  "reduced motion: preference detected and no line animation",
  motionPref && animated === 0,
  `animated frames: ${animated}`,
);
await rctx.close();
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
