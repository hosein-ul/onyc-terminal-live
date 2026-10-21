import { Cron } from "croner";
import type { Ctx, Job } from "./context.js";

export interface RunningScheduler {
  stop: () => void;
}

/** Run a job, logging (never throwing) so one failing job cannot stop the others. */
export async function runJob(ctx: Ctx, job: Job): Promise<void> {
  const started = Date.now();
  try {
    await job.run(ctx);
    ctx.log.info({ job: job.name, ms: Date.now() - started }, "job finished");
  } catch (error) {
    ctx.log.error(
      {
        job: job.name,
        ms: Date.now() - started,
        err: error instanceof Error ? error.stack : String(error),
        cause:
          error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
      },
      "job crashed",
    );
  }
}

/**
 * Start every job on its cron schedule (UTC). `protect` stops a slow run from overlapping the next tick.
 * Startup runs are staggered so the upstreams are not hit all at once.
 */
export function startScheduler(ctx: Ctx, jobs: readonly Job[]): RunningScheduler {
  const crons: Cron[] = [];
  const timers: NodeJS.Timeout[] = [];

  for (const job of jobs) {
    crons.push(
      new Cron(job.schedule, { timezone: "UTC", protect: true, catch: false }, () => {
        void runJob(ctx, job);
      }),
    );
    if (job.runOnStart !== false) {
      timers.push(
        setTimeout(() => {
          void runJob(ctx, job);
        }, job.startDelayMs ?? 0),
      );
    }
    ctx.log.info({ job: job.name, schedule: job.schedule }, "job scheduled");
  }

  return {
    stop: () => {
      for (const cron of crons) cron.stop();
      for (const timer of timers) clearTimeout(timer);
    },
  };
}
