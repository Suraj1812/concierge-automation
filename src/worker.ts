import { logger } from "./infrastructure/logging/logger";
import { startWorkers } from "./workers";
import {
  registerGracefulShutdown,
  startCoreDependencies,
  stopCoreDependencies
} from "./infrastructure/runtime/lifecycle";

const start = async (): Promise<void> => {
  let workers: Awaited<ReturnType<typeof startWorkers>> | null = null;

  registerGracefulShutdown("workers", async () => {
    if (workers) {
      await workers.close();
    }
    await stopCoreDependencies();
  });

  await startCoreDependencies();
  workers = await startWorkers();
  logger.info("Background workers started");
};

void start().catch(async (error) => {
  logger.error("Failed to start worker", { error });
  await stopCoreDependencies().catch((shutdownError) => {
    logger.error("Failed to clean up after worker startup error", { error: shutdownError });
  });
  process.exit(1);
});
