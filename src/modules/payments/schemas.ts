import { z } from "zod";

export const createOrderSchema = z.object({
  body: z.object({
    enquiryId: z.string().min(1),
    proposalId: z.string().min(1)
  })
});

export const razorpayWebhookSchema = z.object({
  body: z.object({
    event: z.string().min(1),
    payload: z.object({
      payment: z.object({
        entity: z.object({
          id: z.string().min(1).optional(),
          order_id: z.string().min(1).optional()
        }).optional()
      }).optional(),
      order: z.object({
        entity: z.object({
          id: z.string().min(1).optional()
        }).optional()
      }).optional()
    }).optional()
  })
});
