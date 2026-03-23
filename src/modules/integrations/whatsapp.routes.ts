import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { whatsAppWebhookController } from "../../container";
import { webhookRateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { whatsappWebhookSchema } from "./whatsapp.schemas";

export const whatsappRoutes = Router();

whatsappRoutes.get("/", asyncHandler(whatsAppWebhookController.verify));
whatsappRoutes.post("/", webhookRateLimit, validate(whatsappWebhookSchema), asyncHandler(whatsAppWebhookController.receive));
