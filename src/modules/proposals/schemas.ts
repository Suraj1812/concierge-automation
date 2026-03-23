import { z } from "zod";

export const generateProposalSchema = z.object({
  body: z.object({
    enquiryId: z.string().min(1)
  })
});

export const proposalIdParamsSchema = z.object({
  params: z.object({
    proposalId: z.string().min(1)
  })
});

export const proposalDocumentAccessSchema = z.object({
  params: z.object({
    proposalId: z.string().min(1)
  }),
  query: z.object({
    token: z.string().min(32)
  })
});
