import IORedis from "ioredis";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";

const redisConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false
};

export const bullMqConnection = {
  ...redisConnectionOptions
};

export const redisConnection = new IORedis({
  ...redisConnectionOptions,
  enableReadyCheck: true,
  lazyConnect: true
});

export const isQueueBackendDisabled = (): boolean => env.DISABLE_QUEUE_BACKEND;

let redisReadyPromise: Promise<void> | null = null;

const buildRedisUnavailableError = (error: unknown): AppError =>
  new AppError(
    `Redis is unavailable at ${env.REDIS_HOST}:${env.REDIS_PORT}`,
    503,
    "REDIS_UNAVAILABLE",
    {
      cause: error instanceof Error ? error.message : String(error)
    }
  );

export const ensureRedisReady = async (): Promise<void> => {
  if (isQueueBackendDisabled()) {
    return;
  }

  if (redisConnection.status === "ready") {
    return;
  }

  if (!redisReadyPromise) {
    redisReadyPromise = (async () => {
      try {
        if (!["connect", "connecting", "ready", "reconnecting"].includes(redisConnection.status)) {
          await redisConnection.connect();
        }

        await redisConnection.ping();
      } catch (error) {
        redisConnection.disconnect(false);
        throw buildRedisUnavailableError(error);
      } finally {
        redisReadyPromise = null;
      }
    })();
  }

  await redisReadyPromise;
};

export const disconnectRedis = async (): Promise<void> => {
  redisReadyPromise = null;

  if (isQueueBackendDisabled()) {
    return;
  }

  if (redisConnection.status === "wait" || redisConnection.status === "end") {
    return;
  }

  try {
    await redisConnection.quit();
  } catch {
    redisConnection.disconnect(false);
  }
};
