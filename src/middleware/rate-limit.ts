import rateLimit from "express-rate-limit";
import { env } from "../config/env";

export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (request) => request.originalUrl.startsWith("/api/webhooks/"),
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Too many requests, please try again shortly"
  }
});

export const authRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false
});

export const webhookRateLimit = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_MAX_REQUESTS * 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    code: "WEBHOOK_RATE_LIMITED",
    message: "Webhook traffic exceeded the permitted threshold"
  }
});
