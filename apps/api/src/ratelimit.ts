export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until a request would be allowed again (0 when allowed). */
  retryAfter: number;
  /** Seconds until the bucket is full. */
  resetSeconds: number;
}

/** Token bucket per key (the client IP). Refills continuously at `perMinute` tokens a minute. */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string): RateDecision {
    const now = this.now();
    const ratePerMs = this.perMinute / 60_000;
    const bucket = this.buckets.get(key) ?? { tokens: this.perMinute, updated: now };
    bucket.tokens = Math.min(this.perMinute, bucket.tokens + (now - bucket.updated) * ratePerMs);
    bucket.updated = now;

    const allowed = bucket.tokens >= 1;
    if (allowed) bucket.tokens -= 1;

    this.buckets.delete(key);
    this.buckets.set(key, bucket);
    while (this.buckets.size > this.maxKeys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done === true) break;
      this.buckets.delete(oldest.value);
    }

    return {
      allowed,
      limit: this.perMinute,
      remaining: Math.floor(bucket.tokens),
      retryAfter: allowed ? 0 : Math.ceil((1 - bucket.tokens) / ratePerMs / 1000),
      resetSeconds: Math.ceil((this.perMinute - bucket.tokens) / ratePerMs / 1000),
    };
  }
}
