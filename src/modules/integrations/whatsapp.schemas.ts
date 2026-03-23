import { z } from "zod";

export const whatsappWebhookSchema = z.object({
  body: z.object({
    entry: z.array(
      z.object({
        changes: z.array(
          z.object({
            value: z.object({
              contacts: z.array(
                z.object({
                  profile: z.object({
                    name: z.string().optional()
                  }).optional(),
                  wa_id: z.string().optional()
                })
              ).optional(),
              messages: z.array(
                z.object({
                  id: z.string().min(1),
                  from: z.string().min(1),
                  timestamp: z.string().optional(),
                  type: z.string(),
                  text: z.object({
                    body: z.string().optional()
                  }).optional()
                })
              ).optional()
            }).passthrough()
          })
        ).optional()
      })
    ).optional()
  })
});
