import { Router } from "express";
import { healthRoutes } from "./modules/health/routes";
import { authRoutes } from "./modules/auth/routes";
import { whatsappRoutes } from "./modules/integrations/whatsapp.routes";
import { enquiryRoutes } from "./modules/enquiries/routes";
import { vendorRoutes } from "./modules/vendors/routes";
import { vendorResponseRoutes } from "./modules/vendors/vendor-response.routes";
import { quoteRoutes } from "./modules/quotes/routes";
import { proposalRoutes } from "./modules/proposals/routes";
import { paymentRoutes } from "./modules/payments/routes";
import { bookingRoutes } from "./modules/bookings/routes";
import { conversationRoutes } from "./modules/conversations/routes";
import { auditRoutes } from "./modules/audit/routes";

export const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/webhooks/whatsapp", whatsappRoutes);
router.use("/webhooks/vendor-responses", vendorResponseRoutes);
router.use("/enquiries", enquiryRoutes);
router.use("/vendors", vendorRoutes);
router.use("/quotes", quoteRoutes);
router.use("/proposals", proposalRoutes);
router.use("/payments", paymentRoutes);
router.use("/bookings", bookingRoutes);
router.use("/conversations", conversationRoutes);
router.use("/audit-logs", auditRoutes);
