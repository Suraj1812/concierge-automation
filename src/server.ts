import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./infrastructure/logging/logger";
import { seedAdminUser } from "./modules/auth/admin-seed";
import {
  closeHttpServer,
  registerGracefulShutdown,
  startCoreDependencies,
  stopCoreDependencies
} from "./infrastructure/runtime/lifecycle";
import type { Server } from "node:http";

const start = async (): Promise<void> => {
  let server: Server | null = null;

  registerGracefulShutdown("API server", async () => {
    if (server) {
      await closeHttpServer(server);
    }
    await stopCoreDependencies();
  });

  await startCoreDependencies();
  await seedAdminUser();

  server = app.listen(env.APP_PORT, () => {
    logger.info(`API server listening on port ${env.APP_PORT}`);
  });
};

void start().catch(async (error) => {
  logger.error("Failed to start server", { error });
  await stopCoreDependencies().catch((shutdownError) => {
    logger.error("Failed to clean up after server startup error", { error: shutdownError });
  });
  process.exit(1);
});
