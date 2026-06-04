interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  isAllowed(key: string): boolean {
    const now = Date.now();
    const entry = this.buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.buckets) {
      if (now >= entry.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}
