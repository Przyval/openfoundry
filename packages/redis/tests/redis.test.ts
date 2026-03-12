import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisCache } from "../src/cache.js";
import { RedisPubSub } from "../src/pubsub.js";
import { RedisLock } from "../src/lock.js";
import { createRedisClient } from "../src/client.js";

// ---------------------------------------------------------------------------
// Mock Redis
// ---------------------------------------------------------------------------

function createMockRedis() {
  const store = new Map<string, string>();
  const expiries = new Map<string, number>();
  const subscribers = new Map<string, ((...args: string[]) => void)[]>();

  const mock = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),

    set: vi.fn(async (...args: unknown[]) => {
      const key = args[0] as string;
      const value = args[1] as string;
      // Handle SET key value PX ttl NX
      if (args.includes("NX")) {
        if (store.has(key)) {
          return null;
        }
      }
      store.set(key, value);
      if (args.includes("PX")) {
        const pxIdx = (args as string[]).indexOf("PX");
        expiries.set(key, Number(args[pxIdx + 1]));
      }
      return "OK";
    }),

    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return "OK";
    }),

    del: vi.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (store.delete(key)) {
          count++;
        }
      }
      return count;
    }),

    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),

    scan: vi.fn(async (_cursor: number, ..._args: unknown[]) => {
      // Extract MATCH pattern
      const matchIdx = (_args as string[]).indexOf("MATCH");
      const pattern = matchIdx >= 0 ? (_args[matchIdx + 1] as string) : "*";

      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      );
      const matched = [...store.keys()].filter((k) => regex.test(k));
      return ["0", matched];
    }),

    keys: vi.fn(async (pattern: string) => {
      const regex = new RegExp(
        "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
      );
      return [...store.keys()].filter((k) => regex.test(k));
    }),

    publish: vi.fn(async (_channel: string, _message: string) => {
      return 1;
    }),

    subscribe: vi.fn(async (channel: string) => {
      if (!subscribers.has(channel)) {
        subscribers.set(channel, []);
      }
    }),

    unsubscribe: vi.fn(async (_channel: string) => {
      subscribers.delete(_channel);
    }),

    psubscribe: vi.fn(async (_pattern: string) => {
      // no-op for mock
    }),

    eval: vi.fn(async (script: string, _numKeys: number, key: string, ...args: string[]) => {
      const token = args[0];
      // Release script
      if (script.includes("del")) {
        if (store.get(key) === token) {
          store.delete(key);
          return 1;
        }
        return 0;
      }
      // Extend script
      if (script.includes("pexpire")) {
        if (store.get(key) === token) {
          return 1;
        }
        return 0;
      }
      return 0;
    }),

    on: vi.fn((_event: string, _handler: (...args: unknown[]) => void) => mock),

    disconnect: vi.fn(),

    // Helpers for tests
    _store: store,
    _emitMessage(channel: string, message: string) {
      const onCalls = mock.on.mock.calls;
      for (const [event, handler] of onCalls) {
        if (event === "message") {
          (handler as (ch: string, msg: string) => void)(channel, message);
        }
      }
    },
    _emitPMessage(pattern: string, channel: string, message: string) {
      const onCalls = mock.on.mock.calls;
      for (const [event, handler] of onCalls) {
        if (event === "pmessage") {
          (handler as (p: string, ch: string, msg: string) => void)(
            pattern,
            channel,
            message,
          );
        }
      }
    },
  };

  return mock;
}

type MockRedis = ReturnType<typeof createMockRedis>;

// ---------------------------------------------------------------------------
// RedisCache tests
// ---------------------------------------------------------------------------

describe("RedisCache", () => {
  let mockRedis: MockRedis;
  let cache: RedisCache;

  beforeEach(() => {
    mockRedis = createMockRedis();
    cache = new RedisCache(mockRedis as never, "cache:");
  });

  it("should get a cached value", async () => {
    mockRedis._store.set("cache:user:1", JSON.stringify({ name: "Alice" }));
    const result = await cache.get<{ name: string }>("user:1");
    expect(result).toEqual({ name: "Alice" });
  });

  it("should return null for missing key", async () => {
    const result = await cache.get("nonexistent");
    expect(result).toBeNull();
  });

  it("should set a value without TTL", async () => {
    await cache.set("key1", { data: 42 });
    expect(mockRedis.set).toHaveBeenCalledWith(
      "cache:key1",
      JSON.stringify({ data: 42 }),
    );
  });

  it("should set a value with TTL", async () => {
    await cache.set("key2", "value", 60);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      "cache:key2",
      60,
      JSON.stringify("value"),
    );
  });

  it("should delete a key", async () => {
    mockRedis._store.set("cache:key1", "val");
    await cache.del("key1");
    expect(mockRedis.del).toHaveBeenCalledWith("cache:key1");
  });

  it("should check if a key exists", async () => {
    mockRedis._store.set("cache:exists-key", "1");
    expect(await cache.has("exists-key")).toBe(true);
    expect(await cache.has("missing-key")).toBe(false);
  });

  it("should return cached value from getOrSet", async () => {
    mockRedis._store.set("cache:computed", JSON.stringify(100));
    const factory = vi.fn(async () => 999);
    const result = await cache.getOrSet("computed", factory);
    expect(result).toBe(100);
    expect(factory).not.toHaveBeenCalled();
  });

  it("should compute and cache value in getOrSet on miss", async () => {
    const factory = vi.fn(async () => ({ fresh: true }));
    const result = await cache.getOrSet("new-key", factory, 30);
    expect(result).toEqual({ fresh: true });
    expect(factory).toHaveBeenCalledOnce();
    expect(mockRedis.setex).toHaveBeenCalled();
  });

  it("should invalidate keys matching a pattern", async () => {
    mockRedis._store.set("cache:user:1", "a");
    mockRedis._store.set("cache:user:2", "b");
    mockRedis._store.set("cache:post:1", "c");
    const count = await cache.invalidatePattern("user:*");
    expect(count).toBe(2);
  });

  it("should clear all prefixed keys", async () => {
    mockRedis._store.set("cache:a", "1");
    mockRedis._store.set("cache:b", "2");
    await cache.clear();
    expect(mockRedis._store.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// RedisPubSub tests
// ---------------------------------------------------------------------------

describe("RedisPubSub", () => {
  let pubClient: MockRedis;
  let subClient: MockRedis;
  let pubsub: RedisPubSub;

  beforeEach(() => {
    pubClient = createMockRedis();
    subClient = createMockRedis();
    pubsub = new RedisPubSub(pubClient as never, subClient as never);
  });

  it("should publish a JSON message", async () => {
    const count = await pubsub.publish("events", { type: "created" });
    expect(pubClient.publish).toHaveBeenCalledWith(
      "events",
      JSON.stringify({ type: "created" }),
    );
    expect(count).toBe(1);
  });

  it("should subscribe to a channel", async () => {
    const handler = vi.fn();
    await pubsub.subscribe("notifications", handler);
    expect(subClient.subscribe).toHaveBeenCalledWith("notifications");
  });

  it("should invoke handler on incoming message", async () => {
    const handler = vi.fn();
    await pubsub.subscribe("ch1", handler);
    subClient._emitMessage("ch1", JSON.stringify({ hello: "world" }));
    expect(handler).toHaveBeenCalledWith({ hello: "world" });
  });

  it("should handle non-JSON messages gracefully", async () => {
    const handler = vi.fn();
    await pubsub.subscribe("ch2", handler);
    subClient._emitMessage("ch2", "plain-text");
    expect(handler).toHaveBeenCalledWith("plain-text");
  });

  it("should unsubscribe from a channel", async () => {
    const handler = vi.fn();
    await pubsub.subscribe("temp", handler);
    await pubsub.unsubscribe("temp");
    expect(subClient.unsubscribe).toHaveBeenCalledWith("temp");
  });

  it("should pattern subscribe", async () => {
    const handler = vi.fn();
    await pubsub.psubscribe("events:*", handler);
    expect(subClient.psubscribe).toHaveBeenCalledWith("events:*");

    subClient._emitPMessage(
      "events:*",
      "events:user",
      JSON.stringify({ action: "login" }),
    );
    expect(handler).toHaveBeenCalledWith("events:user", { action: "login" });
  });

  it("should close both clients", async () => {
    await pubsub.close();
    expect(pubClient.disconnect).toHaveBeenCalled();
    expect(subClient.disconnect).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RedisLock tests
// ---------------------------------------------------------------------------

describe("RedisLock", () => {
  let mockRedis: MockRedis;
  let lock: RedisLock;

  beforeEach(() => {
    mockRedis = createMockRedis();
    lock = new RedisLock(mockRedis as never, "lock:");
  });

  it("should acquire a lock and return a token", async () => {
    const token = await lock.acquire("resource-1", 5000);
    expect(token).toBeTruthy();
    expect(mockRedis.set).toHaveBeenCalled();
    const callArgs = mockRedis.set.mock.calls[0];
    expect(callArgs[0]).toBe("lock:resource-1");
    expect(callArgs[2]).toBe("PX");
    expect(callArgs[3]).toBe(5000);
    expect(callArgs[4]).toBe("NX");
  });

  it("should return null if lock is already held", async () => {
    mockRedis._store.set("lock:taken", "other-token");
    const token = await lock.acquire("taken", 5000);
    expect(token).toBeNull();
  });

  it("should release a lock with correct token", async () => {
    const token = await lock.acquire("rel-test", 5000);
    expect(token).not.toBeNull();
    const released = await lock.release("rel-test", token!);
    expect(released).toBe(true);
  });

  it("should not release a lock with wrong token", async () => {
    await lock.acquire("secure", 5000);
    const released = await lock.release("secure", "wrong-token");
    expect(released).toBe(false);
  });

  it("should extend a lock with correct token", async () => {
    const token = await lock.acquire("extend-me", 5000);
    const extended = await lock.extend("extend-me", token!, 10000);
    expect(extended).toBe(true);
  });

  it("should execute fn within withLock and auto-release", async () => {
    const result = await lock.withLock("auto", 5000, async () => {
      return "done";
    });
    expect(result).toBe("done");
    // Lock should be released
    expect(mockRedis.eval).toHaveBeenCalled();
  });

  it("should throw if lock cannot be acquired in withLock", async () => {
    mockRedis._store.set("lock:busy", "someone-else");
    await expect(
      lock.withLock("busy", 5000, async () => "never"),
    ).rejects.toThrow("Failed to acquire lock");
  });
});

// ---------------------------------------------------------------------------
// createRedisClient tests
// ---------------------------------------------------------------------------

describe("createRedisClient", () => {
  it("should be a function", () => {
    expect(typeof createRedisClient).toBe("function");
  });
});
