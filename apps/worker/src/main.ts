import { connect, desc, eq, migrationsFolder, runMigrations, schema } from "@onyc/db";
import pino from "pino";
import { loadConfig } from "./config.js";
import type { Ctx } from "./context.js";
import { jobs } from "./jobs/index.js";
import { crawlLeaderboard } from "./jobs/rewards.js";
import { isDue, runJob, startScheduler } from "./scheduler.js";

/**
 * Usage:
 *   node dist/main.js                 run every job on its schedule
 *   node dist/main.js run <job>...    run the named jobs once and exit
 *   node dist/main.js due [seconds]   run every job whose schedule fired since it last ran (first time: the last N seconds, default 600) and exit
 *   node dist/main.js crawl [--force] run the leaderboard crawl once and exit
 *   node dist/main.js list            list job names
 */
async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "list") {
    for (const job of jobs) console.log(`${job.name.padEnd(20)} ${job.schedule}`);
    return;
  }

  const config = loadConfig();
  const log = pino({ level: config.LOG_LEVEL });
  const handle = connect(config.DATABASE_URL);
  const ctx: Ctx = { handle, log, config, now: () => new Date(), fetchOptions: {} };

  await runMigrations(handle.db, migrationsFolder);

  if (command === "run") {
    const wanted = new Set(rest);
    const selected = jobs.filter((job) => wanted.has(job.name));
    const unknown = [...wanted].filter((name) => !jobs.some((job) => job.name === name));
    if (unknown.length > 0) throw new Error(`Unknown job(s): ${unknown.join(", ")}`);
    for (const job of selected) await runJob(ctx, job);
    await handle.close();
    return;
  }

  if (command === "due") {
    // Each job is run when its schedule has fired since the last time it ran. The first time, a job looks back `window` seconds.
    const windowSeconds = Number(rest[0] ?? 600);
    const now = ctx.now();
    const t = schema.chainSnapshots;
    const row = (
      await handle.db
        .select()
        .from(t)
        .where(eq(t.kind, "due-last-run"))
        .orderBy(desc(t.ts))
        .limit(1)
    )[0];
    const last = (row?.data ?? {}) as Record<string, string>;
    const fallback = new Date(now.getTime() - windowSeconds * 1000);
    const selected = jobs.filter((job) => {
      const ran = last[job.name] === undefined ? fallback : new Date(last[job.name] ?? "");
      return isDue(job.schedule, Number.isNaN(ran.getTime()) ? fallback : ran, now);
    });
    log.info({ jobs: selected.map((j) => j.name) }, "jobs due");
    // The jobs are independent, so they run side by side; the RPC lanes keep the chain jobs from queuing behind each other.
    const finished: Record<string, string> = { ...last };
    await Promise.all(
      selected.map(async (job) => {
        await runJob(ctx, job);
        finished[job.name] = now.toISOString();
      }),
    );
    await handle.db.insert(t).values({ kind: "due-last-run", ts: now, slot: null, data: finished });
    await handle.close();
    return;
  }

  if (command === "crawl") {
    const outcome = await crawlLeaderboard(ctx, rest.includes("--force"));
    log.info(outcome, "crawl outcome");
    await handle.close();
    return;
  }

  const enabled =
    config.enabledJobs === null
      ? jobs
      : jobs.filter((job) => config.enabledJobs?.has(job.name) === true);
  // A dropped connection must cost one job run, not the whole worker.
  process.on("unhandledRejection", (reason) => {
    log.error(
      { err: reason instanceof Error ? reason.message : String(reason) },
      "unhandled rejection",
    );
  });
  process.on("uncaughtException", (error) => {
    log.error({ err: error.message }, "uncaught exception");
  });
  log.info({ jobs: enabled.map((j) => j.name) }, "worker starting");
  const scheduler = startScheduler(ctx, enabled);

  const shutdown = (signal: string): void => {
    log.info({ signal }, "worker stopping");
    scheduler.stop();
    void handle.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", () => {
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    shutdown("SIGTERM");
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
