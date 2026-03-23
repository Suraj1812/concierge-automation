import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { createQuoteSchema, listQuotesSchema } from "./schemas";
import { quoteController } from "../../container";

export const quoteRoutes = Router();

quoteRoutes.get("/", requireAdminAuth, validate(listQuotesSchema), asyncHandler(quoteController.listByEnquiry));
quoteRoutes.post("/", requireAdminAuth, idempotencyMiddleware, validate(createQuoteSchema), asyncHandler(quoteController.create));
