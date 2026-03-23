import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { whatsAppWebhookController } from "../../container";

export const whatsappRoutes = Router();

whatsappRoutes.get("/", asyncHandler(whatsAppWebhookController.verify));
whatsappRoutes.post("/", asyncHandler(whatsAppWebhookController.receive));
