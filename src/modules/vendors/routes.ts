import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { createVendorSchema, updateVendorSchema } from "./schemas";
import { vendorController } from "../../container";

export const vendorRoutes = Router();

vendorRoutes.get("/", requireAdminAuth, asyncHandler(vendorController.list));
vendorRoutes.post("/", requireAdminAuth, idempotencyMiddleware, validate(createVendorSchema), asyncHandler(vendorController.create));
vendorRoutes.patch("/:vendorId", requireAdminAuth, idempotencyMiddleware, validate(updateVendorSchema), asyncHandler(vendorController.update));
