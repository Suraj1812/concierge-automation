import { connectDatabase } from "./infrastructure/db/mongoose";
import { logger } from "./infrastructure/logging/logger";
import { startWorkers } from "./workers";

const start = async (): Promise<void> => {
  await connectDatabase();
  await startWorkers();
  logger.info("Background workers started");
};

void start().catch((error) => {
  logger.error("Failed to start worker", { error });
  process.exit(1);
});
