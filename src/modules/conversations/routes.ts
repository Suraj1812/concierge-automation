import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { conversationController } from "../../container";

export const conversationRoutes = Router();

conversationRoutes.get("/", requireAdminAuth, asyncHandler(conversationController.list));
