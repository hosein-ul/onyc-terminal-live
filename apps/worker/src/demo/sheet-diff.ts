/**
 * Phase 1 check: show that a change in a published sheet becomes an `events` row.
 * Runs the real sheets job twice against a throwaway database (`onyc_demo`): first with the saved fixtures,
 * then with edited copies (a layer expires, a layer is added, an APY moves, the collateral snapshot refreshes).
 * Usage: pnpm --filter @onyc/worker demo:diff
 */
import { readFileSync } from "node:fs";
import { connect, migrationsFolder, runMigrations, schema } from "@onyc/db";
import pino from "pino";
import postgres from "postgres";
import { loadConfig } from "../config.js";
import type { Ctx } from "../context.js";
import { resetBreakers } from "../health.js";
import { sheetsJob } from "../jobs/sheets.js";

const fixture = (name: string): string =>
  readFileSync(new URL(`../../../../packages/sources/fixtures/${name}`, import.meta.url), "utf8");

function serve(files: Record<string, string>): typeof fetch {
  return (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const gid = /gid=(\d+)/.exec(url)?.[1];
    const body = gid === undefined ? undefined : files[gid];
    if (body === undefined) return Promise.reject(new Error(`no fixture for ${url}`));
    return Promise.resolve(new Response(body, { status: 200 }));
  };
}

const original = {
  "297157125": fixture("sheet_reinsurance.csv"),
  "1418034083": fixture("sheet_opportunities.csv"),
  "362705568": fixture("sheet_nav.csv"),
  "1591707661": fixture("sheet_collateral.csv"),
};

const edited = {
  ...original,
  // Layer 9000002 expires, and a new layer 9000032 is bound.
  "297157125": `${original["297157125"].replace(/^(9000002,)Bound/m, "$1Expired").trimEnd()}\n9000032,Bound,Oct-2026,Oct-2027,Japan Named Windstorm and Earthquake,ILW,2 000 000,300 000,200 000,5.00%\n`,
  // The first Kamino looping APY moves from about 20.8% to 22.8%.
  "1418034083": original["1418034083"].replace(",0.2080042056,", ",0.2280042056,"),
  // The collateral sheet is refreshed a day later.
  "1591707661": original["1591707661"].replaceAll("20/10/2026", "21/10/2026"),
};

async function main(): Promise<void> {
  const base = loadConfig();
  const adminUrl = new URL(base.DATABASE_URL);
  adminUrl.pathname = "/postgres";
  const demoUrl = new URL(base.DATABASE_URL);
  demoUrl.pathname = "/onyc_demo";

  const admin = postgres(adminUrl.href, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists onyc_demo");
  await admin.unsafe("create database onyc_demo");

  const handle = connect(demoUrl.href, { max: 2 });
  try {
    await runMigrations(handle.db, migrationsFolder);
    const log = pino({ level: "silent" });
    let clock = new Date("2026-10-21T12:00:00Z");
    const make = (files: Record<string, string>): Ctx => ({
      handle,
      log,
      config: { ...base, DATABASE_URL: demoUrl.href },
      now: () => clock,
      fetchOptions: { fetchImpl: serve(files), retries: 0 },
    });

    await sheetsJob.run(make(original));
    const first = await handle.db.select().from(schema.events);
    console.log(`Run 1 (baseline from fixtures): ${first.length} events (none expected).`);

    clock = new Date("2026-10-21T12:30:00Z");
    resetBreakers();
    await sheetsJob.run(make(edited));
    const second = await handle.db.select().from(schema.events);
    console.log(`Run 2 (edited sheets): ${second.length} events:`);
    for (const e of second) console.log(`  [${e.severity}] ${e.kind}: ${e.title}`);

    clock = new Date("2026-10-21T13:00:00Z");
    await sheetsJob.run(make(edited));
    const third = await handle.db.select().from(schema.events);
    console.log(
      `Run 3 (same edited sheets again): ${third.length} events (unchanged, idempotent).`,
    );
    const history = await handle.db.select().from(schema.reinsuranceLayersHistory);
    console.log(`reinsurance_layers_history rows: ${history.length}`);
  } finally {
    await handle.close();
    await admin.unsafe("drop database if exists onyc_demo");
    await admin.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
