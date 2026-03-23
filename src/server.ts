import type { Server } from "node:http";
import { app } from "./app";
import { connectDatabase } from "./infrastructure/db/mongoose";
import { env } from "./config/env";
import { logger } from "./infrastructure/logging/logger";
import { seedAdminUser } from "./modules/auth/admin-seed";
import { disconnectDatabase } from "./infrastructure/db/mongoose";

const start = async (): Promise<void> => {
  await connectDatabase();
  await seedAdminUser();

  const server = app.listen(env.APP_PORT, () => {
    logger.info(`API server listening on port ${env.APP_PORT}`);
  });

  const shutdown = async (signal: string, activeServer: Server) => {
    logger.info(`Received ${signal}, shutting down API server`);

    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    await disconnectDatabase();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT", server);
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM", server);
  });
};

void start().catch((error) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});
