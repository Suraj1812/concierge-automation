import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { generateProposalSchema, proposalIdParamsSchema } from "./schemas";
import { proposalController } from "../../container";

export const proposalRoutes = Router();

proposalRoutes.post("/generate", requireAdminAuth, idempotencyMiddleware, validate(generateProposalSchema), asyncHandler(proposalController.generate));
proposalRoutes.get("/:proposalId", requireAdminAuth, validate(proposalIdParamsSchema), asyncHandler(proposalController.getById));
