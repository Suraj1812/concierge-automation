import { z } from "zod";

export const inboundEmailWebhookSchema = z.object({
  body: z.object({
    from: z.string().email(),
    to: z.string().email(),
    subject: z.string().min(1),
    text: z.string().min(1),
    providerMessageId: z.string().min(1).optional()
  })
});
