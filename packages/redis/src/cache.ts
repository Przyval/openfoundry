import type Redis from "ioredis";

export class RedisCache {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(redis: Redis, prefix: string = "cache:") {
    this.redis = redis;
    this.prefix = prefix;
  }

  private prefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.prefixedKey(key));
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const prefixed = this.prefixedKey(key);

    if (ttlSeconds !== undefined) {
      await this.redis.setex(prefixed, ttlSeconds, serialized);
    } else {
      await this.redis.set(prefixed, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(this.prefixedKey(key));
  }

  async has(key: string): Promise<boolean> {
    const result = await this.redis.exists(this.prefixedKey(key));
    return result === 1;
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const existing = await this.get<T>(key);
    if (existing !== null) {
      return existing;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<number> {
    const fullPattern = this.prefixedKey(pattern);
    let cursor = "0";
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        Number(cursor),
        "MATCH",
        fullPattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        deletedCount += await this.redis.del(...keys);
      }
    } while (cursor !== "0");

    return deletedCount;
  }

  async clear(): Promise<void> {
    await this.invalidatePattern("*");
  }
}
