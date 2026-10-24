import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  /** The underlying postgres.js client, for raw SQL and for closing the pool. */
  sql: Sql;
  close: () => Promise<void>;
}

export function connect(databaseUrl: string, options: { max?: number } = {}): DbHandle {
  const sql = postgres(databaseUrl, {
    max: options.max ?? 10,
    // A hosted database drops idle connections; recycling them early avoids a reset in the middle of a query.
    idle_timeout: 20,
    max_lifetime: 60 * 10,
    connect_timeout: 30,
    // postgres.js reads numeric as strings by default; columns here are double precision or bigint(number).
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

/** Apply every pending migration in `migrationsFolder`. Safe to run on every start. */
export async function runMigrations(db: Database, migrationsFolder: string): Promise<void> {
  await migrate(db, { migrationsFolder });
}
