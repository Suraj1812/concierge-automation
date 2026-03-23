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

  const existing = await repository.findByKey(key);

  if (existing) {
    if (existing.requestHash !== requestHash) {
      next(new AppError("Idempotency key reuse with different payload is not allowed", 409, "IDEMPOTENCY_CONFLICT"));
      return;
    }

    response.status(existing.responseStatus).json(existing.responseBody);
    return;
  }

  const originalJson = response.json.bind(response);

  response.json = ((body: Record<string, unknown>) => {
    void repository.create({
      key,
      route: request.originalUrl,
      method: request.method,
      requestHash,
      responseStatus: response.statusCode,
      responseBody: body,
      expiresAt: addMinutes(new Date(), 24 * 60)
    });
    return originalJson(body);
  }) as Response["json"];

  next();
};
