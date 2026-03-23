import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { authRateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { loginSchema } from "./schemas";
import { authController } from "../../container";

export const authRoutes = Router();

authRoutes.post("/login", authRateLimit, validate(loginSchema), asyncHandler(authController.login));
