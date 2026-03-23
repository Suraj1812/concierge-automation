import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { enquiryIdParamsSchema } from "./schemas";
import { enquiryController } from "../../container";

export const enquiryRoutes = Router();

enquiryRoutes.get("/", requireAdminAuth, asyncHandler(enquiryController.list));
enquiryRoutes.get("/:enquiryId", requireAdminAuth, validate(enquiryIdParamsSchema), asyncHandler(enquiryController.getById));
