import { app } from "./app";
import { connectDatabase } from "./infrastructure/db/mongoose";
import { env } from "./config/env";
import { logger } from "./infrastructure/logging/logger";
import { seedAdminUser } from "./modules/auth/admin-seed";

const start = async (): Promise<void> => {
  await connectDatabase();
  await seedAdminUser();

  app.listen(env.APP_PORT, () => {
    logger.info(`API server listening on port ${env.APP_PORT}`);
  });
};

void start().catch((error) => {
  logger.error("Failed to start server", { error });
  process.exit(1);
});
