import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../middleware/validate";
import { webhookRateLimit } from "../../middleware/rate-limit";
import { razorpayWebhookSchema } from "./schemas";
import { paymentController } from "../../container";

export const paymentWebhookRoutes = Router();

paymentWebhookRoutes.post("/", webhookRateLimit, validate(razorpayWebhookSchema), asyncHandler(paymentController.handleWebhook));
