// Local Postgres 16 without Docker. Same credentials as docker-compose.yml, so .env.example works for both.
// Usage: pnpm db:local   (keeps running until Ctrl+C; data lives in .pgdata/)
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.PGPORT ?? 5432);
const databaseDir = resolve(process.cwd(), ".pgdata");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "onyc",
  password: "onyc_dev_only",
  port,
  persistent: true,
  onLog: () => {},
  onError: (message) => console.error("[postgres]", String(message).trim()),
});

const fresh = !existsSync(resolve(databaseDir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("onyc");
console.log(
  `Postgres 16 ready on localhost:${port} (database "onyc", user "onyc"). Ctrl+C to stop.`,
);

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
setInterval(() => {}, 1 << 30);
