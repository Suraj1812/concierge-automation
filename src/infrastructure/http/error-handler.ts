import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../common/errors/AppError";
import { logger } from "../logging/logger";
import { errorTracker } from "../observability/error-tracker";
import { metrics } from "../observability/metrics";

export const notFoundHandler = (request: Request, response: Response): void => {
  metrics.increment("http_not_found_total", {
    method: request.method,
    path: request.originalUrl
  });
  response.status(404).json({
    success: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`
  });
};

export const errorHandler = (error: Error, request: Request, response: Response, _next: NextFunction): void => {
  const correlationId = request.correlationId;

  if (error instanceof ZodError) {
    metrics.increment("http_validation_errors_total", {
      path: request.originalUrl,
      method: request.method
    });

    response.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: error.flatten(),
      correlationId
    });
    return;
  }

  if (error instanceof AppError) {
    logger.warn("Application error handled", {
      correlationId,
      path: request.originalUrl,
      method: request.method,
      code: error.code,
      statusCode: error.statusCode,
      details: error.details
    });

    metrics.increment("application_handled_errors_total", {
      code: error.code,
      status: error.statusCode
    });

    response.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details,
      correlationId
    });
    return;
  }

  errorTracker.captureException(error, {
    correlationId,
    path: request.originalUrl,
    method: request.method
  });

  response.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
    correlationId
  });
};
