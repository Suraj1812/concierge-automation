import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { createOrderSchema } from "./schemas";
import { paymentController } from "../../container";

export const paymentRoutes = Router();

paymentRoutes.post("/webhook", asyncHandler(paymentController.handleWebhook));
paymentRoutes.post("/orders", requireAdminAuth, idempotencyMiddleware, validate(createOrderSchema), asyncHandler(paymentController.createOrder));
