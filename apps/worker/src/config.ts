import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === "" ? undefined : value.trim()));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  HELIUS_API_KEY: optionalString,
  /** A private Solana RPC endpoint. Without it and without a Helius key the public endpoint is used, slowly. */
  SOLANA_RPC_URL: optionalString,
  /** An ONyc transfer or program event moving at least this many tokens is recorded as large. */
  CHAIN_LARGE_TRANSFER_ONYC: z.coerce.number().positive().default(100_000),
  /** Alert when the AUM the API reports differs from on-chain supply times NAV by more than this fraction. */
  CHAIN_AUM_GAP_ALERT: z.coerce.number().positive().default(0.02),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  /** Comma-separated job names to run; empty means all. */
  WORKER_JOBS: optionalString,
  /** Our alert thresholds. They are settings, not data, so they live here and nowhere else. */
  DISCOUNT_ALERT_BPS: z.coerce.number().positive().default(50),
  SOLVENCY_STALE_HOURS: z.coerce.number().positive().default(24),
  OPPORTUNITY_APY_EVENT_MIN_DELTA: z.coerce.number().positive().default(0.005),
  LEADERBOARD_PAGE_SIZE: z.coerce.number().int().min(10).max(500).default(250),
  /** Full venue breakdown is kept for this many top wallets per daily snapshot. */
  LEADERBOARD_BREAKDOWN_TOP: z.coerce.number().int().min(0).default(1000),
  /** Pause between leaderboard pages, in ms. The crawl is sequential (one request in flight). */
  LEADERBOARD_PAGE_DELAY_MS: z.coerce.number().int().min(0).default(500),
});

export type WorkerConfig = z.infer<typeof envSchema> & { enabledJobs: ReadonlySet<string> | null };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid worker configuration: ${problems}`);
  }
  const names = parsed.data.WORKER_JOBS;
  return {
    ...parsed.data,
    enabledJobs:
      names === undefined
        ? null
        : new Set(
            names
              .split(",")
              .map((n) => n.trim())
              .filter((n) => n !== ""),
          ),
  };
}
