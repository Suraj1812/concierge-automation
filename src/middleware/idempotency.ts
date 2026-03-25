import { NextFunction, Request, Response } from "express";
import { IdempotencyKeyRepository } from "../modules/integrations/idempotency-key.repository";
import { AppError } from "../common/errors/AppError";
import { addMinutes } from "../common/utils/date";
import { sha256 } from "../common/utils/crypto";
import { logger } from "../infrastructure/logging/logger";

const repository = new IdempotencyKeyRepository();

const idempotencyMiddlewareHandler = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
  const key = request.headers["idempotency-key"] as string | undefined;

  if (!key) {
    next(new AppError("Idempotency-Key header is required", 400, "IDEMPOTENCY_KEY_REQUIRED"));
    return;
  }

  const requestHash = sha256(JSON.stringify({
    method: request.method,
    route: request.originalUrl,
    body: request.body
  }));

  const started = await repository.startProcessing({
    key,
    route: request.originalUrl,
    method: request.method,
    requestHash,
    expiresAt: addMinutes(new Date(), 24 * 60),
    lockTtlMs: 5 * 60_000
  });

  if (started.record && started.record.requestHash !== requestHash) {
    next(new AppError("Idempotency key reuse with different payload is not allowed", 409, "IDEMPOTENCY_CONFLICT"));
    return;
  }

  if (started.outcome === "replay" && started.record?.responseStatus && started.record.responseBody) {
    response.status(started.record.responseStatus).json(started.record.responseBody);
    return;
  }

  if (started.outcome === "in_progress") {
    next(new AppError("A request with this idempotency key is already being processed", 409, "IDEMPOTENCY_IN_PROGRESS"));
    return;
  }

  const originalJson = response.json.bind(response);
  const originalSend = response.send.bind(response);
  let responseCaptured = false;
  let responseBody: Record<string, unknown> | undefined;
  let finalized = false;

  const persistOutcome = (operation: Promise<void>): void => {
    void operation.catch((error) => {
      logger.warn("Failed to persist idempotency state", {
        key,
        route: request.originalUrl,
        method: request.method,
        error
      });
    });
  };

  const finalize = (operationFactory: () => Promise<void>): void => {
    if (finalized) {
      return;
    }

    finalized = true;
    persistOutcome(operationFactory());
  };

  response.once("finish", () => {
    if (!responseCaptured) {
      finalize(() => repository.fail(key, `Request finished without a captured response body (status ${response.statusCode})`));
      return;
    }

    if (response.statusCode >= 500) {
      finalize(() => repository.fail(key, `Request failed with status ${response.statusCode}`));
      return;
    }

    finalize(() => repository.complete(key, response.statusCode, responseBody ?? {}));
  });

  response.once("close", () => {
    if (!response.writableEnded) {
      finalize(() => repository.fail(key, "Connection closed before the response completed"));
    }
  });

  response.json = ((body: unknown) => {
    responseCaptured = true;
    responseBody = typeof body === "object" && body !== null ? body as Record<string, unknown> : { value: body };
    return originalJson(body);
  }) as Response["json"];

  response.send = ((body?: unknown) => {
    responseCaptured = true;
    responseBody = typeof body === "object" && body !== null
      ? body as Record<string, unknown>
      : body === undefined
        ? {}
        : { value: body };
    return originalSend(body);
  }) as Response["send"];

  next();
};

export const idempotencyMiddleware = (request: Request, response: Response, next: NextFunction): void => {
  void idempotencyMiddlewareHandler(request, response, next).catch(next);
};
