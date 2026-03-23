import IORedis from "ioredis";
import { env } from "../../config/env";

export const bullMqConnection = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null
};

export const redisConnection = new IORedis({
  ...bullMqConnection,
  enableReadyCheck: true,
  lazyConnect: true
});
