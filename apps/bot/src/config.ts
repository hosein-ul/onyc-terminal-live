import { z } from "zod";

/** An env var set to nothing (`TELEGRAM_BOT_TOKEN=`) counts as not set. */
const optional = (s: z.ZodString = z.string()) =>
  z.preprocess((v) => (v === "" ? undefined : v), s.optional());

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  /** Without a token the bot does not talk to Telegram; webhook rules still deliver. */
  TELEGRAM_BOT_TOKEN: optional(),
  /** Where the API answers; the bot reads wallet ranks and the redemption log from it. */
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  /** Optional link printed in alerts, for example the Overview of one of the web apps. */
  WEB_PUBLIC_URL: optional(),
  /** Signs webhook bodies (HMAC-SHA256 in `X-Onyc-Signature`) when set. */
  WEBHOOK_SECRET: optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DELIVERY_INTERVAL_MS: z.coerce.number().int().min(1000).default(15_000),
  DERIVE_INTERVAL_MS: z.coerce.number().int().min(5000).default(60_000),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return schema.parse(env);
}
