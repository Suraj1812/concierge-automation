import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { emailAutomationController } from "../../container";

export const emailRoutes = Router();

emailRoutes.get("/", asyncHandler(emailAutomationController.list));
