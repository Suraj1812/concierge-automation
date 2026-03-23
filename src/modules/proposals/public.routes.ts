import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { validate } from "../../middleware/validate";
import { proposalDocumentAccessSchema } from "./schemas";
import { proposalController } from "../../container";

export const proposalPublicRoutes = Router();

proposalPublicRoutes.get("/shared/:proposalId/document", validate(proposalDocumentAccessSchema), asyncHandler(proposalController.downloadDocument));
