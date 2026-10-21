interface Entry<T> {
  value: T;
  expires: number;
}

/**
 * In-memory TTL cache with a size cap (least recently used goes first) and de-duplication of concurrent
 * loads for the same key, so a burst of identical requests runs the query once.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  async getOrLoad(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<{ value: T; hit: boolean }> {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, hit: true };
    const pending = this.inflight.get(key);
    if (pending !== undefined) return { value: await pending, hit: true };
    const promise = load();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      if (ttlMs > 0) this.set(key, value, ttlMs);
      return { value, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
