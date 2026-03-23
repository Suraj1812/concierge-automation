import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../middleware/validate";
import { requireAdminAuth, requirePlatformAdmin } from "../../middleware/auth";
import { tenantController } from "../../container";
import { createTenantSchema, updateTenantSchema } from "./schemas";

export const tenantRoutes = Router();

tenantRoutes.get("/current", requireAdminAuth, asyncHandler(tenantController.current));
tenantRoutes.get("/", requireAdminAuth, requirePlatformAdmin, asyncHandler(tenantController.list));
tenantRoutes.post("/", requireAdminAuth, requirePlatformAdmin, validate(createTenantSchema), asyncHandler(tenantController.create));
tenantRoutes.patch("/:tenantId", requireAdminAuth, requirePlatformAdmin, validate(updateTenantSchema), asyncHandler(tenantController.update));
