import { z } from "zod";

export const connectorWhatsAppInboundSchema = z.object({
  body: z.object({
    phone: z.string().min(8),
    message: z.string().min(1),
    name: z.string().min(1).optional(),
    whatsappUserId: z.string().min(1).optional(),
    messageId: z.string().min(1).optional()
  })
});

export const connectorEmailInboundSchema = z.object({
  body: z.object({
    from: z.string().email(),
    to: z.string().email().optional(),
    subject: z.string().min(1),
    text: z.string().min(1),
    providerMessageId: z.string().min(1).optional()
  })
});

export const connectorVendorResponseSchema = z.object({
  body: z.object({
    externalEventId: z.string().min(1).optional(),
    vendorReference: z.string().min(1).optional(),
    vendorId: z.string().min(1).optional(),
    enquiryId: z.string().min(1).optional(),
    rawPayload: z.string().min(1),
    expiresAt: z.string().datetime().optional()
  }).refine(
    (body) => Boolean(body.vendorReference || body.vendorId || body.externalEventId || body.enquiryId),
    "Connector payload must include an externalEventId, vendorReference, vendorId, or enquiryId"
  )
});
