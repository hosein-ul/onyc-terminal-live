import { createHash } from "node:crypto";
import { desc, eq, and, schema, sql } from "@onyc/db";
import type { SourceResult } from "@onyc/sources";
import type { Ctx } from "./context.js";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface SavedSnapshot {
  /** True when this payload differs from the previous one for the same source and endpoint. */
  changed: boolean;
  hash: string;
}

/**
 * Store a fetch in `raw_snapshots`. A payload identical to the latest one for the same endpoint is folded into
 * it (`seen_count`, `last_seen_at`) rather than stored again.
 */
export async function saveRaw(
  ctx: Ctx,
  source: string,
  endpoint: string,
  result: Pick<SourceResult<unknown>, "raw" | "status" | "fetchedAt">,
  kind: "json" | "text",
): Promise<SavedSnapshot> {
  const hash = sha256(result.raw);
  const { db } = ctx.handle;
  const t = schema.rawSnapshots;

  const latest = await db
    .select({ id: t.id, hash: t.hash })
    .from(t)
    .where(and(eq(t.source, source), eq(t.endpoint, endpoint)))
    .orderBy(desc(t.fetchedAt), desc(t.id))
    .limit(1);

  const previous = latest[0];
  if (previous !== undefined && previous.hash === hash) {
    await db
      .update(t)
      .set({ lastSeenAt: result.fetchedAt, seenCount: sql`${t.seenCount} + 1` })
      .where(eq(t.id, previous.id));
    return { changed: false, hash };
  }

  await db.insert(t).values({
    source,
    endpoint,
    fetchedAt: result.fetchedAt,
    lastSeenAt: result.fetchedAt,
    status: result.status,
    payload: kind === "json" ? (JSON.parse(result.raw) as unknown) : null,
    payloadText: kind === "text" ? result.raw : null,
    hash,
  });
  return { changed: true, hash };
}

/** Insert in chunks so one statement never exceeds the driver's parameter limit. */
export async function chunked<T>(
  rows: readonly T[],
  size: number,
  write: (chunk: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size));
  }
}

/** Floor to the start of the UTC minute, so a repeated run in the same minute is an idempotent upsert. */
export function floorToMinute(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 60_000) * 60_000);
}

export function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
