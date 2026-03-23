import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { vendorResponseController } from "../../container";

export const vendorResponseRoutes = Router();

vendorResponseRoutes.post("/", asyncHandler(vendorResponseController.receiveWebhook));
