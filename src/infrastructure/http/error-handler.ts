import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../common/errors/AppError";
import { logger } from "../logging/logger";

export const notFoundHandler = (request: Request, response: Response): void => {
  response.status(404).json({
    success: false,
    message: `Route not found: ${request.method} ${request.originalUrl}`
  });
};

export const errorHandler = (error: Error, request: Request, response: Response, _next: NextFunction): void => {
  const correlationId = request.correlationId;

  if (error instanceof ZodError) {
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
    response.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details,
      correlationId
    });
    return;
  }

  logger.error("Unhandled application error", {
    correlationId,
    path: request.originalUrl,
    method: request.method,
    error
  });

  response.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Something went wrong",
    correlationId
  });
};
