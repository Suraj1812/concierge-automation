import { z } from "zod";

export const vendorResponseWebhookSchema = z.object({
  body: z.object({
    externalEventId: z.string().min(1).optional(),
    vendorReference: z.string().min(1).optional(),
    vendorId: z.string().min(1).optional(),
    enquiryId: z.string().min(1).optional(),
    rawPayload: z.string().min(1),
    expiresAt: z.string().datetime().optional()
  }).refine(
    (body) => Boolean(body.vendorReference || body.vendorId || body.externalEventId || body.enquiryId),
    "Webhook payload must include an externalEventId, vendorReference, vendorId, or enquiryId"
  )
});
