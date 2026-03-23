import { connectDatabase } from "./infrastructure/db/mongoose";
import { disconnectDatabase } from "./infrastructure/db/mongoose";
import { logger } from "./infrastructure/logging/logger";
import { startWorkers } from "./workers";

const start = async (): Promise<void> => {
  await connectDatabase();
  const workers = await startWorkers();
  logger.info("Background workers started");

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down workers`);
    await workers.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
};

void start().catch((error) => {
  logger.error("Failed to start worker", { error });
  process.exit(1);
});
