import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { safeEqual } from "../common/utils/crypto";
import { AppError } from "../common/errors/AppError";

const resolveAutomationKey = (request: Request): string | undefined => {
  const headerKey = request.headers["x-automation-key"];
  if (typeof headerKey === "string" && headerKey.trim()) {
    return headerKey.trim();
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice(7).trim();
  }

  return undefined;
};

export const requireAutomationAuth = (request: Request, _response: Response, next: NextFunction): void => {
  const incomingKey = resolveAutomationKey(request);

  if (!incomingKey || !safeEqual(incomingKey, env.AUTOMATION_API_KEY)) {
    next(new AppError("Invalid automation API key", 403, "INVALID_AUTOMATION_API_KEY"));
    return;
  }

  next();
};
