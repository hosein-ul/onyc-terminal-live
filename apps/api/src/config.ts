import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  /** Comma-separated origins allowed by CORS; "*" allows all (the API is public and read-only). */
  CORS_ORIGINS: z.string().default("*"),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(120),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  HELIUS_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim())),
  /** Policy share of AUM the Transparency page calls the liquidity layer ("Liquidity layer (15%)"). */
  LIQUIDITY_TARGET: z.coerce.number().min(0).max(1).default(0.15),
  SOLVENCY_STALE_HOURS: z.coerce.number().positive().default(24),
  /** Cache lifetime for upstream wallet lookups, seconds. */
  WALLET_CACHE_SECONDS: z.coerce.number().int().min(0).default(60),
});

export type ApiConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid API configuration: ${problems}`);
  }
  return parsed.data;
}
