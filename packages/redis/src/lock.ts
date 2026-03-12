import type Redis from "ioredis";
import { randomUUID } from "node:crypto";

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export class RedisLock {
  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(redis: Redis, prefix: string = "lock:") {
    this.redis = redis;
    this.prefix = prefix;
  }

  private prefixedKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async acquire(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const prefixed = this.prefixedKey(key);

    const result = await this.redis.set(
      prefixed,
      token,
      "PX",
      ttlMs,
      "NX",
    );

    return result === "OK" ? token : null;
  }

  async release(key: string, token: string): Promise<boolean> {
    const prefixed = this.prefixedKey(key);
    const result = await this.redis.eval(
      RELEASE_SCRIPT,
      1,
      prefixed,
      token,
    );
    return result === 1;
  }

  async extend(key: string, token: string, ttlMs: number): Promise<boolean> {
    const prefixed = this.prefixedKey(key);
    const result = await this.redis.eval(
      EXTEND_SCRIPT,
      1,
      prefixed,
      token,
      ttlMs.toString(),
    );
    return result === 1;
  }

  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const token = await this.acquire(key, ttlMs);
    if (token === null) {
      throw new Error(`Failed to acquire lock for key: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }
}
