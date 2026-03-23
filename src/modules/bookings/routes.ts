import { Router } from "express";
import { asyncHandler } from "../../common/utils/async-handler";
import { requireAdminAuth } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { idempotencyMiddleware } from "../../middleware/idempotency";
import { updateBookingSchema } from "./schemas";
import { bookingController } from "../../container";

export const bookingRoutes = Router();

bookingRoutes.get("/", requireAdminAuth, asyncHandler(bookingController.list));
bookingRoutes.patch("/:bookingId", requireAdminAuth, idempotencyMiddleware, validate(updateBookingSchema), asyncHandler(bookingController.update));
