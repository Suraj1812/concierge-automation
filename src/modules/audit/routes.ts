import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { auditController } from "../../container";

export const auditRoutes = Router();

auditRoutes.get("/", requireAdminAuth, asyncHandler(auditController.list));
