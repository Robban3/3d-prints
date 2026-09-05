import type { RequestHandler } from 'express';

/**
 * Takgräns per IP i minnet. Räcker för en instans; bakom flera instanser
 * behöver räknaren flyttas till delad lagring, men gränssnittet är detsamma.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Map<string, Bucket>>();

export interface RateLimitOptions {
  /** Namn på gränsen, så att olika rutter räknas var för sig. */
  name: string;
  windowMs: number;
  max: number;
  message: string;
}

export function rateLimit(options: RateLimitOptions): RequestHandler {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'okänd';
    const scope = buckets.get(options.name) ?? new Map<string, Bucket>();
    buckets.set(options.name, scope);

    const bucket = scope.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((at) => now - at < options.windowMs);

    if (bucket.hits.length >= options.max) {
      const retryAfter = Math.ceil((options.windowMs - (now - bucket.hits[0]!)) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      res.status(429).json({ error: options.message });
      scope.set(key, bucket);
      return;
    }

    bucket.hits.push(now);
    scope.set(key, bucket);
    next();
  };
}

/** Bara för tester. */
export function resetRateLimit(name?: string): void {
  if (name) buckets.delete(name);
  else buckets.clear();
}

export function currentHits(name: string, key: string): number {
  return buckets.get(name)?.get(key)?.hits.length ?? 0;
}
