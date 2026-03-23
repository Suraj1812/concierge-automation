import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../middleware/validate";
import { emailAutomationController } from "../../container";
import { inboundEmailWebhookSchema } from "./schemas";

export const emailWebhookRoutes = Router();

emailWebhookRoutes.post("/", validate(inboundEmailWebhookSchema), asyncHandler(emailAutomationController.receiveWebhook));
