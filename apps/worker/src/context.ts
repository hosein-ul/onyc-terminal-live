import type { DbHandle } from "@onyc/db";
import type { FetchOptions } from "@onyc/sources";
import type { Logger } from "pino";
import type { WorkerConfig } from "./config.js";

/** Everything a job needs. Tests build one with a fake clock and fake fetch. */
export interface Ctx {
  handle: DbHandle;
  log: Logger;
  config: WorkerConfig;
  /** Injectable clock. */
  now: () => Date;
  /** Passed to every source client; tests inject a fake `fetch`. */
  fetchOptions: FetchOptions;
}

export interface Job {
  name: string;
  /** croner pattern; six fields include seconds. */
  schedule: string;
  /** Runs once at startup before the schedule takes over. Default true. */
  runOnStart?: boolean;
  /** Delay in ms for the startup run, to stagger load on upstreams. */
  startDelayMs?: number;
  run: (ctx: Ctx) => Promise<void>;
}
