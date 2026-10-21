import { schema, sql } from "@onyc/db";
import { SourceError, type SourceResult } from "@onyc/sources";
import type { Ctx } from "./context.js";
import { emitEvent } from "./events.js";

/** After this many consecutive failures an endpoint is `down`; fewer is `degraded`. */
const DOWN_AFTER = 3;
/** Breaker: this many consecutive transport failures (network, timeout, 5xx) open the source circuit. */
const BREAKER_AFTER = 5;
const BREAKER_BASE_MS = 60_000;
const BREAKER_MAX_MS = 10 * 60_000;

interface Breaker {
  failures: number;
  openUntil: number;
  trips: number;
}

const breakers = new Map<string, Breaker>();

export function resetBreakers(): void {
  breakers.clear();
}

function isTransport(error: unknown): boolean {
  if (!(error instanceof SourceError)) return true;
  if (error.kind === "network" || error.kind === "timeout") return true;
  return (
    error.kind === "http" &&
    (error.status === undefined || error.status >= 500 || error.status === 429)
  );
}

/** True while the circuit for `source` is open. Calls are skipped, not queued. */
export function circuitOpen(source: string, now: number): boolean {
  const breaker = breakers.get(source);
  return breaker !== undefined && breaker.openUntil > now;
}

export function noteResult(source: string, ok: boolean, transport: boolean, now: number): void {
  const breaker = breakers.get(source) ?? { failures: 0, openUntil: 0, trips: 0 };
  if (ok) {
    breakers.set(source, { failures: 0, openUntil: 0, trips: 0 });
    return;
  }
  if (!transport) return;
  breaker.failures += 1;
  if (breaker.failures >= BREAKER_AFTER) {
    breaker.trips += 1;
    breaker.openUntil = now + Math.min(BREAKER_BASE_MS * 2 ** (breaker.trips - 1), BREAKER_MAX_MS);
    breaker.failures = 0;
  }
  breakers.set(source, breaker);
}

export async function recordSuccess(
  ctx: Ctx,
  source: string,
  endpoint: string,
  latencyMs: number | null,
): Promise<void> {
  const now = ctx.now();
  noteResult(source, true, false, now.getTime());
  await ctx.handle.db
    .insert(schema.sourceHealth)
    .values({
      source,
      endpoint,
      status: "ok",
      lastOkAt: now,
      consecutiveFailures: 0,
      lastLatencyMs: latencyMs,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.sourceHealth.source, schema.sourceHealth.endpoint],
      set: {
        status: "ok",
        lastOkAt: now,
        consecutiveFailures: 0,
        lastLatencyMs: latencyMs,
        updatedAt: now,
      },
    });
}

export async function recordFailure(
  ctx: Ctx,
  source: string,
  endpoint: string,
  error: unknown,
): Promise<void> {
  const now = ctx.now();
  noteResult(source, false, isTransport(error), now.getTime());
  const message = error instanceof Error ? error.message : String(error);
  const kind = error instanceof SourceError ? error.kind : "unknown";
  ctx.log.warn({ source, endpoint, kind, err: message }, "source call failed");

  const rows = await ctx.handle.db
    .insert(schema.sourceHealth)
    .values({
      source,
      endpoint,
      status: "degraded",
      lastErrorAt: now,
      lastError: message.slice(0, 1000),
      lastErrorKind: kind,
      consecutiveFailures: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.sourceHealth.source, schema.sourceHealth.endpoint],
      set: {
        lastErrorAt: now,
        lastError: message.slice(0, 1000),
        lastErrorKind: kind,
        consecutiveFailures: sql`${schema.sourceHealth.consecutiveFailures} + 1`,
        status: sql`case when ${schema.sourceHealth.consecutiveFailures} + 1 >= ${DOWN_AFTER} then 'down' else 'degraded' end`,
        updatedAt: now,
      },
    })
    .returning({
      status: schema.sourceHealth.status,
      failures: schema.sourceHealth.consecutiveFailures,
    });

  const row = rows[0];
  if (row?.status === "down" && row.failures === DOWN_AFTER) {
    await emitEvent(ctx, {
      kind: "source_down",
      severity: "watch",
      title: `Source down: ${source} ${endpoint}`,
      body: `${DOWN_AFTER} consecutive failures. Last error: ${message.slice(0, 300)}`,
      data: { source, endpoint, kind },
      dedupKey: `source_down:${source}:${endpoint}:${now.toISOString().slice(0, 13)}`,
    });
  }
}

export async function recordNotConfigured(
  ctx: Ctx,
  source: string,
  endpoint: string,
  reason: string,
): Promise<void> {
  const now = ctx.now();
  await ctx.handle.db
    .insert(schema.sourceHealth)
    .values({
      source,
      endpoint,
      status: "not_configured",
      lastError: reason,
      consecutiveFailures: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.sourceHealth.source, schema.sourceHealth.endpoint],
      set: { status: "not_configured", lastError: reason, updatedAt: now },
    });
}

/**
 * Run one upstream call with health bookkeeping and circuit breaking. Returns null when the call failed or
 * was skipped; the failure is logged and stored in `source_health`, never swallowed.
 */
export async function track<T>(
  ctx: Ctx,
  source: string,
  endpoint: string,
  call: () => Promise<SourceResult<T>>,
): Promise<SourceResult<T> | null> {
  if (circuitOpen(source, ctx.now().getTime())) {
    ctx.log.debug({ source, endpoint }, "circuit open, call skipped");
    return null;
  }
  try {
    const result = await call();
    await recordSuccess(ctx, source, endpoint, result.latencyMs);
    return result;
  } catch (error) {
    await recordFailure(ctx, source, endpoint, error);
    return null;
  }
}
