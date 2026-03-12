import Redis from "ioredis";

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
}

export function createRedisClient(config?: RedisConfig): Redis {
  const url = config?.url ?? process.env["REDIS_URL"];

  let client: Redis;

  if (url) {
    client = new Redis(url, {
      keyPrefix: config?.keyPrefix,
      maxRetriesPerRequest: config?.maxRetriesPerRequest ?? 3,
    });
  } else {
    client = new Redis({
      host: config?.host ?? "localhost",
      port: config?.port ?? 6379,
      password: config?.password,
      db: config?.db ?? 0,
      keyPrefix: config?.keyPrefix,
      maxRetriesPerRequest: config?.maxRetriesPerRequest ?? 3,
    });
  }

  client.on("connect", () => {
    console.log("[redis] Connected to Redis");
  });

  client.on("error", (err: Error) => {
    console.error("[redis] Redis connection error:", err.message);
  });

  client.on("close", () => {
    console.log("[redis] Redis connection closed");
  });

  return client;
}
