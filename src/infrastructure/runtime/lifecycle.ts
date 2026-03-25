import type { Server } from "node:http";
import { disconnectRedis, ensureRedisReady } from "../cache/redis";
import { connectDatabase, disconnectDatabase } from "../db/mongoose";
import { logger } from "../logging/logger";
import { errorTracker } from "../observability/error-tracker";
import { clearInlineQueueJobs } from "../queue/queues";

type ShutdownTask = () => Promise<void>;

const formatShutdownError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const toError = (error: unknown, fallbackMessage: string): Error =>
  error instanceof Error ? error : new Error(`${fallbackMessage}: ${String(error)}`);

let runtimeGuardsRegistered = false;

export const startCoreDependencies = async (): Promise<void> => {
  await Promise.all([
    connectDatabase(),
    ensureRedisReady()
  ]);
};

export const stopCoreDependencies = async (): Promise<void> => {
  clearInlineQueueJobs();

  const results = await Promise.allSettled([
    disconnectDatabase(),
    disconnectRedis()
  ]);

  const failures = results.flatMap((result) => (
    result.status === "rejected" ? [formatShutdownError(result.reason)] : []
  ));

  if (failures.length > 0) {
    throw new Error(`Failed to stop core dependencies: ${failures.join("; ")}`);
  }
};

export const closeHttpServer = async (server: Server): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

export const registerGracefulShutdown = (processName: string, shutdownTask: ShutdownTask): void => {
  let shuttingDown = false;

  const handleShutdown = async (reason: string, error?: unknown): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`Received ${reason}, shutting down ${processName}`);

    if (error) {
      errorTracker.captureException(toError(error, reason), {
        processName,
        reason
      });
    }

    try {
      await shutdownTask();
      process.exit(0);
    } catch (error) {
      logger.error(`Failed to shut down ${processName}`, {
        reason,
        error
      });
      process.exit(1);
    }
  };

  if (!runtimeGuardsRegistered) {
    runtimeGuardsRegistered = true;

    process.on("unhandledRejection", (reason) => {
      void handleShutdown("unhandledRejection", reason);
    });

    process.on("uncaughtException", (error) => {
      void handleShutdown("uncaughtException", error);
    });
  }

  process.once("SIGINT", () => {
    void handleShutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void handleShutdown("SIGTERM");
  });
};
