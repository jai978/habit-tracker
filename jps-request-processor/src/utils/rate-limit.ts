import type { RequestHandler } from 'express';

/**
 * Fixed-window rate limiter, in memory.
 *
 * One process, one operator, no Redis. It exists to stop a loop or a scanner
 * from hammering the webhook or the dashboard, not to be a distributed quota.
 */
export function rateLimit(options: { windowMs: number; max: number; key?: (ip: string) => string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip ?? 'unknown';
    const key = options.key ? options.key(ip) : ip;

    // Opportunistic sweep: the map only holds active windows.
    if (hits.size > 10_000) {
      for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    next();
  };
}
