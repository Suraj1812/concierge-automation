import { Router } from "express";
import mongoose from "mongoose";
import { redisConnection } from "../../infrastructure/cache/redis";
import { asyncHandler } from "../../common/utils/async-handler";

export const healthRoutes = Router();

healthRoutes.get(
  "/",
  asyncHandler(async (_request, response) => {
    const redisStatus = redisConnection.status;
    response.status(200).json({
      success: true,
      data: {
        mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        redis: redisStatus,
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  })
);
