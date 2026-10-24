import { connect, migrationsFolder, runMigrations } from "@onyc/db";
import { Cron } from "croner";
import pino from "pino";
import { loadConfig } from "./config.js";
import type { Ctx } from "./context.js";
import { jobs } from "./jobs/index.js";
import { crawlLeaderboard } from "./jobs/rewards.js";
import { runJob, startScheduler } from "./scheduler.js";

/**
 * Usage:
 *   node dist/main.js                 run every job on its schedule
 *   node dist/main.js run <job>...    run the named jobs once and exit
 *   node dist/main.js due [seconds]   run the jobs whose schedule fired in the last N seconds (default 300) and exit
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
    const windowSeconds = Number(rest[0] ?? 300);
    const now = ctx.now();
    const since = new Date(now.getTime() - windowSeconds * 1000);
    const selected = jobs.filter((job) => {
      const next = new Cron(job.schedule, { timezone: "UTC" }).nextRun(since);
      return next !== null && next.getTime() <= now.getTime();
    });
    log.info({ jobs: selected.map((j) => j.name), windowSeconds }, "jobs due");
    // The jobs are independent, so they run side by side; the RPC lanes keep the chain jobs from queuing behind each other.
    await Promise.all(selected.map((job) => runJob(ctx, job)));
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
