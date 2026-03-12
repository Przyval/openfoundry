import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RateLimiterConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional prefix for rate-limit keys (useful when sharing a Redis instance). */
  keyPrefix?: string;
}

// ---------------------------------------------------------------------------
// Rate limiter result
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Number of remaining requests in the current window. */
  remaining: number;
  /** Milliseconds until the bucket fully refills. */
  resetMs: number;
}

// ---------------------------------------------------------------------------
// Rate limiter interface
// ---------------------------------------------------------------------------

export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
  stop(): void;
}

// ---------------------------------------------------------------------------
// Token bucket entry
// ---------------------------------------------------------------------------

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

// ---------------------------------------------------------------------------
// In-memory rate limiter (token bucket)
// ---------------------------------------------------------------------------

export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, BucketEntry>();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(private readonly config: RateLimiterConfig) {
    // Periodically purge expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    // Allow the timer to not keep the process alive
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const prefixedKey = this.config.keyPrefix
      ? `${this.config.keyPrefix}:${key}`
      : key;

    let entry = this.buckets.get(prefixedKey);

    if (!entry) {
      entry = { tokens: this.config.maxRequests, lastRefill: now };
      this.buckets.set(prefixedKey, entry);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - entry.lastRefill;
    const refillRate = this.config.maxRequests / this.config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    entry.tokens = Math.min(this.config.maxRequests, entry.tokens + tokensToAdd);
    entry.lastRefill = now;

    const resetMs = Math.ceil(
      ((this.config.maxRequests - entry.tokens) / this.config.maxRequests) *
        this.config.windowMs,
    );

    if (entry.tokens < 1) {
      return {
        allowed: false,
        remaining: 0,
        resetMs: Math.ceil((1 - entry.tokens) / refillRate),
      };
    }

    entry.tokens -= 1;

    return {
      allowed: true,
      remaining: Math.floor(entry.tokens),
      resetMs,
    };
  }

  stop(): void {
    clearInterval(this.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.buckets) {
      // If enough time has passed that the bucket would be fully refilled,
      // the entry is no longer needed.
      const elapsed = now - entry.lastRefill;
      if (elapsed >= this.config.windowMs) {
        this.buckets.delete(key);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Redis rate limiter (token bucket via Lua script)
// ---------------------------------------------------------------------------

export class RedisRateLimiter implements RateLimiter {
  private fallback: InMemoryRateLimiter;
  private redis: any | null = null;
  private ready = false;

  constructor(
    private readonly config: RateLimiterConfig,
    private readonly redisUrl: string,
  ) {
    this.fallback = new InMemoryRateLimiter(config);
    this.initRedis().catch(() => {
      // If Redis init fails, we silently fall back to in-memory
    });
  }

  private async initRedis(): Promise<void> {
    try {
      // Dynamic import so ioredis is truly optional
      const { default: Redis } = await import("ioredis");
      this.redis = new Redis(this.redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      await this.redis.connect();
      this.ready = true;
    } catch {
      this.redis = null;
      this.ready = false;
    }
  }

  async consume(key: string): Promise<RateLimitResult> {
    if (!this.ready || !this.redis) {
      return this.fallback.consume(key);
    }

    const prefixedKey = this.config.keyPrefix
      ? `${this.config.keyPrefix}:${key}`
      : `rl:${key}`;

    try {
      return await this.consumeFromRedis(prefixedKey);
    } catch {
      // On any Redis error, fall back to in-memory
      return this.fallback.consume(key);
    }
  }

  private async consumeFromRedis(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const maxRequests = this.config.maxRequests;
    const windowMs = this.config.windowMs;

    // Atomic token bucket via MULTI/EXEC
    const pipeline = this.redis.multi();
    pipeline.hgetall(key);
    const preResults = await pipeline.exec();

    const data = preResults?.[0]?.[1] as Record<string, string> | null;
    let tokens: number;
    let lastRefill: number;

    if (!data || !data.tokens) {
      tokens = maxRequests;
      lastRefill = now;
    } else {
      tokens = parseFloat(data.tokens);
      lastRefill = parseInt(data.lastRefill, 10);

      // Refill based on elapsed time
      const elapsed = now - lastRefill;
      const refillRate = maxRequests / windowMs;
      tokens = Math.min(maxRequests, tokens + elapsed * refillRate);
      lastRefill = now;
    }

    if (tokens < 1) {
      const refillRate = maxRequests / windowMs;
      const resetMs = Math.ceil((1 - tokens) / refillRate);

      // Update Redis state
      const update = this.redis.multi();
      update.hset(key, "tokens", String(tokens), "lastRefill", String(lastRefill));
      update.pexpire(key, windowMs);
      await update.exec();

      return { allowed: false, remaining: 0, resetMs };
    }

    tokens -= 1;
    const remaining = Math.floor(tokens);
    const resetMs = Math.ceil(
      ((maxRequests - tokens) / maxRequests) * windowMs,
    );

    // Persist updated bucket
    const update = this.redis.multi();
    update.hset(key, "tokens", String(tokens), "lastRefill", String(lastRefill));
    update.pexpire(key, windowMs);
    await update.exec();

    return { allowed: true, remaining, resetMs };
  }

  stop(): void {
    this.fallback.stop();
    if (this.redis) {
      this.redis.disconnect();
      this.redis = null;
      this.ready = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRateLimiter(
  config: RateLimiterConfig,
  redisUrl?: string,
): RateLimiter {
  if (redisUrl) {
    return new RedisRateLimiter(config, redisUrl);
  }
  return new InMemoryRateLimiter(config);
}

// ---------------------------------------------------------------------------
// Fastify plugin
// ---------------------------------------------------------------------------

export interface RateLimitPluginOptions {
  config: RateLimiterConfig;
  redisUrl?: string;
}

/**
 * Extract a rate-limit key from the request.
 *
 * Precedence:
 * 1. Authorization header (hashed to avoid storing raw tokens)
 * 2. Client IP address
 */
function extractKey(request: FastifyRequest): string {
  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.length > 0) {
    // Use a simple hash of the auth header to avoid storing credentials
    let hash = 0;
    for (let i = 0; i < auth.length; i++) {
      hash = (hash * 31 + auth.charCodeAt(i)) | 0;
    }
    return `auth:${hash.toString(36)}`;
  }
  return `ip:${request.ip}`;
}

export async function rateLimitPlugin(
  app: FastifyInstance,
  options: RateLimitPluginOptions,
): Promise<void> {
  const limiter = createRateLimiter(options.config, options.redisUrl);

  // Ensure we clean up when the server shuts down
  app.addHook("onClose", async () => {
    limiter.stop();
  });

  app.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const key = extractKey(request);
      const result = await limiter.consume(key);

      // Always set informational headers
      reply.header("X-RateLimit-Limit", options.config.maxRequests);
      reply.header("X-RateLimit-Remaining", result.remaining);
      reply.header("X-RateLimit-Reset", Math.ceil(result.resetMs / 1000));

      if (!result.allowed) {
        const retryAfterSec = Math.ceil(result.resetMs / 1000);
        reply.header("Retry-After", retryAfterSec);
        reply
          .status(429)
          .send({
            errorCode: "RATE_LIMITED",
            errorName: "RateLimitExceeded",
            errorInstanceId: crypto.randomUUID(),
            parameters: {},
            statusCode: 429,
            message: "Too many requests. Please try again later.",
          });
      }
    },
  );
}
