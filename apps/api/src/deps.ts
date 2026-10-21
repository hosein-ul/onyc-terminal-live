import type { DbHandle } from "@onyc/db";
import type { FetchOptions } from "@onyc/sources";
import type { Logger } from "pino";
import type { ApiConfig } from "./config.js";

export interface Deps {
  handle: DbHandle;
  config: ApiConfig;
  log: Logger;
  now: () => Date;
  /** Passed to upstream clients used on demand (wallet lookups); tests inject a fake fetch. */
  fetchOptions: FetchOptions;
}
