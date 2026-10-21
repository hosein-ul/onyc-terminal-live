import { connect } from "@onyc/db";
import { createClient } from "@onyc/sdk";
import pino from "pino";
import { loadConfig } from "./config.js";
import { deliverPending, type Sender } from "./deliver.js";
import { deriveLargeRedemptionEvents, deriveWalletRankEvents } from "./derived.js";
import { handleMessage } from "./handlers.js";
import { TelegramClient } from "./telegram.js";
import { postWebhook } from "./webhook.js";

const config = loadConfig();
const log = pino({ level: config.LOG_LEVEL });
const handle = connect(config.DATABASE_URL, { max: 4 });
const api = createClient({ baseUrl: config.API_PUBLIC_URL });
const telegram =
  config.TELEGRAM_BOT_TOKEN === undefined ? null : new TelegramClient(config.TELEGRAM_BOT_TOKEN);

const sender: Sender = {
  telegram: telegram === null ? null : (chatId, text) => telegram.sendMessage(chatId, text),
  webhook: (url, payload) => postWebhook(url, payload, { secret: config.WEBHOOK_SECRET }),
};

let stopping = false;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Run `task` forever, `everyMs` apart, never letting one failure stop the loop. */
async function loop(name: string, everyMs: number, task: () => Promise<void>): Promise<void> {
  while (!stopping) {
    try {
      await task();
    } catch (e) {
      log.error(
        { loop: name, error: e instanceof Error ? e.message : String(e) },
        "loop iteration failed",
      );
    }
    await sleep(everyMs);
  }
}

async function poll(): Promise<void> {
  if (telegram === null) return;
  let offset = 0;
  while (!stopping) {
    try {
      const { updates, nextOffset } = await telegram.getUpdates(offset, 25);
      offset = nextOffset;
      for (const u of updates) {
        if (u.chatType !== "private") continue; // rules belong to a person, not to a group
        const reply = await handleMessage(handle.db, u.chatId, u.text);
        await telegram.sendMessage(u.chatId, reply);
      }
    } catch (e) {
      log.warn({ error: e instanceof Error ? e.message : String(e) }, "telegram poll failed");
      await sleep(5000);
    }
  }
}

log.info({ telegram: telegram !== null, api: config.API_PUBLIC_URL }, "alert bot starting");
if (telegram === null)
  log.warn(
    "TELEGRAM_BOT_TOKEN is not set: Telegram rules are recorded but not sent; webhooks still deliver",
  );

const stop = (): void => {
  stopping = true;
  void handle.close().finally(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await Promise.all([
  poll(),
  loop("deliver", config.DELIVERY_INTERVAL_MS, async () => {
    const r = await deliverPending(handle.db, sender, {
      now: new Date(),
      log,
      webUrl: config.WEB_PUBLIC_URL,
    });
    if (r.sent + r.failed + r.skipped > 0) log.info(r, "alerts delivered");
  }),
  loop("derive", config.DERIVE_INTERVAL_MS, async () => {
    const now = new Date();
    const wallets = await deriveWalletRankEvents(handle.db, api, now, log);
    const redemptions = await deriveLargeRedemptionEvents(handle.db, api, log);
    if (wallets + redemptions > 0) log.info({ wallets, redemptions }, "derived events");
  }),
]);
