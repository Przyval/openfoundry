import type Redis from "ioredis";
import { createRedisClient, type RedisConfig } from "./client.js";

type MessageHandler = (message: unknown) => void;
type PatternHandler = (channel: string, message: unknown) => void;

export class RedisPubSub {
  private readonly publishClient: Redis;
  private readonly subscribeClient: Redis;
  private readonly channelHandlers = new Map<string, MessageHandler>();
  private readonly patternHandlers = new Map<string, PatternHandler>();

  constructor(publishClient: Redis, subscribeClient: Redis) {
    this.publishClient = publishClient;
    this.subscribeClient = subscribeClient;

    this.subscribeClient.on("message", (channel: string, message: string) => {
      const handler = this.channelHandlers.get(channel);
      if (handler) {
        try {
          handler(JSON.parse(message));
        } catch {
          handler(message);
        }
      }
    });

    this.subscribeClient.on(
      "pmessage",
      (pattern: string, channel: string, message: string) => {
        const handler = this.patternHandlers.get(pattern);
        if (handler) {
          try {
            handler(channel, JSON.parse(message));
          } catch {
            handler(channel, message);
          }
        }
      },
    );
  }

  async publish(channel: string, message: unknown): Promise<number> {
    const serialized = JSON.stringify(message);
    return this.publishClient.publish(channel, serialized);
  }

  async subscribe(
    channel: string,
    handler: MessageHandler,
  ): Promise<void> {
    this.channelHandlers.set(channel, handler);
    await this.subscribeClient.subscribe(channel);
  }

  async unsubscribe(channel: string): Promise<void> {
    this.channelHandlers.delete(channel);
    await this.subscribeClient.unsubscribe(channel);
  }

  async psubscribe(
    pattern: string,
    handler: PatternHandler,
  ): Promise<void> {
    this.patternHandlers.set(pattern, handler);
    await this.subscribeClient.psubscribe(pattern);
  }

  async close(): Promise<void> {
    this.channelHandlers.clear();
    this.patternHandlers.clear();
    this.publishClient.disconnect();
    this.subscribeClient.disconnect();
  }
}

export function createPubSub(config?: RedisConfig): RedisPubSub {
  const publishClient = createRedisClient(config);
  const subscribeClient = createRedisClient(config);
  return new RedisPubSub(publishClient, subscribeClient);
}
