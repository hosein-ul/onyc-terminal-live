// Recreate the local development database as UTF-8 and apply the migrations. Dev data only: it DROPS the database.
// Why: Postgres started on Windows defaults to WIN1252, which cannot store the true minus sign (U+2212) used in event titles.
// Usage: pnpm db:utf8   (needs DATABASE_URL, for example from .env; run `pnpm db:local` first)
import { connect, migrationsFolder, runMigrations } from "../dist/index.js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(2);
}
const target = new URL(url);
const name = target.pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name)) {
  console.error(`Refusing to touch database "${name}"`);
  process.exit(2);
}
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
  console.error("This script only works on a local database.");
  process.exit(2);
}
const admin = new URL(url);
admin.pathname = "/postgres";
const sql = postgres(admin.href, { max: 1, onnotice: () => {} });
const [row] =
  await sql`select pg_encoding_to_char(encoding) as enc from pg_database where datname = ${name}`;
if (row?.enc === "UTF8") {
  console.log(`"${name}" is already UTF8.`);
} else {
  await sql.unsafe(`drop database if exists ${name} with (force)`);
  await sql.unsafe(
    `create database ${name} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`,
  );
  console.log(`Recreated "${name}" as UTF8.`);
}
await sql.end();

const handle = connect(url, { max: 1 });
await runMigrations(handle.db, migrationsFolder);
await handle.close();
console.log("Migrations applied. Start the worker to fill it again.");
