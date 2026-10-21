import { serve } from "@hono/node-server";
import { connect, migrationsFolder, runMigrations } from "@onyc/db";
import pino from "pino";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const log = pino({ level: config.LOG_LEVEL });
  const handle = connect(config.DATABASE_URL, { max: 10 });
  await runMigrations(handle.db, migrationsFolder);

  const { app } = createApp({ handle, config, log, now: () => new Date(), fetchOptions: {} });
  const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
    log.info({ port: info.port }, "API listening");
  });

  const shutdown = (signal: string): void => {
    log.info({ signal }, "API stopping");
    server.close(() => {
      void handle.close().finally(() => process.exit(0));
    });
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
