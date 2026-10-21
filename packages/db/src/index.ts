import { fileURLToPath } from "node:url";

export * from "./client.js";
export * as schema from "./schema.js";
export * from "./schema.js";
export { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";

/** Absolute path of the SQL migrations shipped with this package. */
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
