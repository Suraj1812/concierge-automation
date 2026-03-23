import { NextFunction, Request, Response } from "express";
import { IdempotencyKeyRepository } from "../modules/integrations/idempotency-key.repository";
import { AppError } from "../common/errors/AppError";
import { addMinutes } from "../common/utils/date";
import { sha256 } from "../common/utils/crypto";

const repository = new IdempotencyKeyRepository();

export const idempotencyMiddleware = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
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
  let responseCaptured = false;
  let responseBody: Record<string, unknown> | undefined;

  response.on("finish", () => {
    if (!responseCaptured) {
      void repository.fail(key, `Request finished without a JSON response (status ${response.statusCode})`);
      return;
    }

    if (response.statusCode >= 500) {
      void repository.fail(key, `Request failed with status ${response.statusCode}`);
      return;
    }

    void repository.complete(key, response.statusCode, responseBody ?? {});
  });

  response.on("close", () => {
    if (!response.writableEnded) {
      void repository.fail(key, "Connection closed before the response completed");
    }
  });

  response.json = ((body: unknown) => {
    responseCaptured = true;
    responseBody = typeof body === "object" && body !== null ? body as Record<string, unknown> : { value: body };
    return originalJson(body);
  }) as Response["json"];

  next();
};
