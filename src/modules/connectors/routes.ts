import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../middleware/validate";
import { webhookRateLimit } from "../../middleware/rate-limit";
import { connectorController } from "../../container";
import {
  connectorEmailInboundSchema,
  connectorVendorResponseSchema,
  connectorWhatsAppInboundSchema
} from "./schemas";

export const connectorRoutes = Router();

connectorRoutes.get("/health", asyncHandler(connectorController.health));
connectorRoutes.post(
  "/whatsapp/inbound",
  webhookRateLimit,
  validate(connectorWhatsAppInboundSchema),
  asyncHandler(connectorController.queueWhatsAppInbound)
);
connectorRoutes.post(
  "/email/inbound",
  webhookRateLimit,
  validate(connectorEmailInboundSchema),
  asyncHandler(connectorController.ingestEmailInbound)
);
connectorRoutes.post(
  "/vendor-responses/inbound",
  webhookRateLimit,
  validate(connectorVendorResponseSchema),
  asyncHandler(connectorController.ingestVendorResponse)
);
