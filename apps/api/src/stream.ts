import { desc, gt, schema } from "@onyc/db";
import type { EventItem } from "@onyc/sdk";
import type { Deps } from "./deps.js";

export interface Tick {
  ts: string;
  nav: number | null;
  apy: number | null;
  tvl: number | null;
  marketPrice: number | null;
  premiumBps: number | null;
}

type Listener = (
  message: { type: "tick"; tick: Tick } | { type: "event"; event: EventItem },
) => void;

/**
 * One poller shared by every SSE client: it reads the newest live tick and any new events from the database
 * (the worker writes them from another process) and fans them out. It runs only while someone is listening.
 */
export class StreamHub {
  private readonly listeners = new Set<Listener>();
  private timer: NodeJS.Timeout | null = null;
  private lastTickTs = 0;
  private lastEventId: number | null = null;

  constructor(
    private readonly deps: Deps,
    private readonly intervalMs = 5_000,
  ) {}

  get listenerCount(): number {
    return this.listeners.size;
  }

  async latestTick(): Promise<Tick | null> {
    const t = schema.liveTicks;
    const row = (await this.deps.handle.db.select().from(t).orderBy(desc(t.ts)).limit(1))[0];
    return row === undefined
      ? null
      : {
          ts: row.ts.toISOString(),
          nav: row.nav,
          apy: row.apy,
          tvl: row.tvl,
          marketPrice: row.marketPrice,
          premiumBps: row.premiumBps,
        };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.timer === null) {
      this.timer = setInterval(() => {
        void this.poll();
      }, this.intervalMs);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Check the database once and notify listeners. Public so tests can drive it. */
  async poll(): Promise<void> {
    try {
      const tick = await this.latestTick();
      if (tick !== null && Date.parse(tick.ts) > this.lastTickTs) {
        this.lastTickTs = Date.parse(tick.ts);
        for (const l of this.listeners) l({ type: "tick", tick });
      }

      const e = schema.events;
      if (this.lastEventId === null) {
        const newest = (
          await this.deps.handle.db.select({ id: e.id }).from(e).orderBy(desc(e.id)).limit(1)
        )[0];
        this.lastEventId = newest?.id ?? 0;
        return;
      }
      const fresh = await this.deps.handle.db
        .select()
        .from(e)
        .where(gt(e.id, this.lastEventId))
        .orderBy(e.id)
        .limit(50);
      for (const row of fresh) {
        this.lastEventId = row.id;
        const event: EventItem = {
          id: row.id,
          ts: row.ts.toISOString(),
          kind: row.kind,
          severity: row.severity as EventItem["severity"],
          title: row.title,
          body: row.body,
          data: row.data ?? null,
        };
        for (const l of this.listeners) l({ type: "event", event });
      }
    } catch (error) {
      this.deps.log.warn(
        { err: error instanceof Error ? error.message : String(error) },
        "stream poll failed",
      );
    }
  }
}
