import { z } from "zod";

export const enquiryIdParamsSchema = z.object({
  params: z.object({
    enquiryId: z.string().min(1)
  })
});
