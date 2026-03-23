import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { dashboardController } from "../../container";

export const dashboardRoutes = Router();

dashboardRoutes.get("/overview", asyncHandler(dashboardController.overview));
dashboardRoutes.get("/funnel", asyncHandler(dashboardController.funnel));
dashboardRoutes.get("/activity", asyncHandler(dashboardController.activity));
