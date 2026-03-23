import { Router } from "express";
import mongoose from "mongoose";
import { redisConnection } from "../../infrastructure/cache/redis";
import { asyncHandler } from "../../common/utils/async-handler";
import { metrics } from "../../infrastructure/observability/metrics";

export const healthRoutes = Router();

const resolveHealthSnapshot = () => ({
  mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  redis: redisConnection.status,
  uptimeSeconds: Math.floor(process.uptime()),
  timestamp: new Date().toISOString()
});

healthRoutes.get(
  "/live",
  asyncHandler(async (_request, response) => {
    response.status(200).json({
      success: true,
      data: {
        status: "live",
        timestamp: new Date().toISOString()
      }
    });
  })
);

healthRoutes.get(
  "/ready",
  asyncHandler(async (_request, response) => {
    const snapshot = resolveHealthSnapshot();
    const isReady = snapshot.mongo === "connected" && ["ready", "connect", "connecting"].includes(snapshot.redis);

    response.status(isReady ? 200 : 503).json({
      success: isReady,
      data: {
        ...snapshot,
        status: isReady ? "ready" : "degraded"
      }
    });
  })
);

healthRoutes.get(
  "/metrics",
  asyncHandler(async (_request, response) => {
    response.type("text/plain").status(200).send(metrics.toPrometheus());
  })
);

healthRoutes.get(
  "/",
  asyncHandler(async (_request, response) => {
    response.status(200).json({
      success: true,
      data: resolveHealthSnapshot()
    });
  })
);
