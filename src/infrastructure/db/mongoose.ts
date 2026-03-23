import mongoose from "mongoose";
import { env } from "../../config/env";
import { logger } from "../logging/logger";

export const connectDatabase = async (): Promise<void> => {
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000
  });

  logger.info("MongoDB connected");
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
};
