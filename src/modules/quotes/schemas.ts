import { z } from "zod";

export const createQuoteSchema = z.object({
  body: z.object({
    enquiryId: z.string().min(1),
    vendorId: z.string().min(1),
    rawPayload: z.string().min(10),
    expiresAt: z.string().datetime().optional()
  })
});

export const listQuotesSchema = z.object({
  query: z.object({
    enquiryId: z.string().min(1)
  })
});
