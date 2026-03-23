import { z } from "zod";

export const createOrderSchema = z.object({
  body: z.object({
    enquiryId: z.string().min(1),
    proposalId: z.string().min(1)
  })
});
