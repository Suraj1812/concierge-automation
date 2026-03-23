import { NextFunction, Request, Response } from "express";
import { logger } from "../logging/logger";
import { metrics } from "../observability/metrics";

const resolveRouteLabel = (request: Request): string => {
  if (request.route?.path) {
    return `${request.baseUrl || ""}${request.route.path}`;
  }

  return request.originalUrl.split("?")[0];
};

export const requestLogger = (request: Request, response: Response, next: NextFunction): void => {
  const startedAt = process.hrtime.bigint();

  response.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const route = resolveRouteLabel(request);
    const labels = {
      method: request.method,
      route,
      status: String(response.statusCode)
    };

    metrics.increment("http_requests_total", labels);
    metrics.observe("http_request_duration_ms", durationMs, labels);

    logger.info("HTTP request completed", {
      correlationId: request.correlationId,
      method: request.method,
      route,
      path: request.originalUrl,
      statusCode: response.statusCode,
      durationMs,
      userAgent: request.headers["user-agent"],
      ip: request.ip
    });
  });

  next();
};
