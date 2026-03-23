import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { vendorResponseController } from "../../container";
import { webhookRateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { vendorResponseWebhookSchema } from "./vendor-response.schemas";

export const vendorResponseRoutes = Router();

vendorResponseRoutes.post("/", webhookRateLimit, validate(vendorResponseWebhookSchema), asyncHandler(vendorResponseController.receiveWebhook));
