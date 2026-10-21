/** Push requests allowed per student per minute (sync-api §9). */
export const PUSHES_PER_MINUTE = 60;

/**
 * A per-student limit over a rolling window, kept in memory. Each running copy of the API
 * counts on its own, so with several replicas a student could get up to that many times the
 * limit; it is a guard against a phone stuck in a loop, not a quota. A first sync of a whole
 * phone needs only a handful of pushes (MAX_OPERATIONS_PER_PUSH changes each).
 */
export function createRateLimit(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();

  /** Forgets students with no request in the window, so memory doesn't grow with users. */
  const sweep = (at: number) => {
    for (const [key, times] of hits) {
      if (times.at(-1)! <= at - windowMs) hits.delete(key);
    }
  };

  return {
    /** Counts one request; 0 when allowed, otherwise whole seconds until one is allowed again. */
    take(key: string): number {
      const at = now();
      if (hits.size > 10_000) sweep(at);
      const recent = (hits.get(key) ?? []).filter((t) => t > at - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0]! + windowMs - at) / 1000));
      }
      recent.push(at);
      hits.set(key, recent);
      return 0;
    },
  };
}
