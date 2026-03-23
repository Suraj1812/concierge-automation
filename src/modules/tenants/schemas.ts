import { z } from "zod";

const tenantFeatureFlagsSchema = z.object({
  emailAutomation: z.boolean().default(true),
  customProposalTemplates: z.boolean().default(true),
  advancedDecisionEngine: z.boolean().default(true),
  vendorPortal: z.boolean().default(false),
  usageBilling: z.boolean().default(true)
});

const tenantConfigSchema = z.object({
  ai: z.object({
    tone: z.string().min(2),
    styleGuide: z.string().optional(),
    fallbackReply: z.string().min(5),
    clarificationStrategy: z.string().min(5),
    hallucinationGuardrails: z.array(z.string()).default([])
  }),
  proposal: z.object({
    companyName: z.string().min(2),
    accentColor: z.string().min(4),
    footerNote: z.string().optional(),
    templateName: z.string().min(2)
  }),
  automation: z.object({
    vendorRetryLimit: z.number().int().min(0),
    customerFollowUpMinutes: z.number().int().min(1),
    paymentRetryLimit: z.number().int().min(0)
  }),
  pricing: z.object({
    serviceFeePercentage: z.number().min(0),
    minimumServiceFee: z.number().min(0),
    currency: z.string().min(1)
  }),
  integrations: z.object({
    vendorAutomation: z.object({
      inboundWebhookSecret: z.string().optional()
    }),
    whatsapp: z.object({
      enabled: z.boolean(),
      verifyToken: z.string().optional(),
      appSecret: z.string().optional(),
      phoneNumberId: z.string().optional(),
      accessToken: z.string().optional(),
      apiVersion: z.string().optional()
    }),
    razorpay: z.object({
      enabled: z.boolean(),
      keyId: z.string().optional(),
      keySecret: z.string().optional(),
      webhookSecret: z.string().optional()
    }),
    email: z.object({
      enabled: z.boolean(),
      fromAddress: z.string().email().optional(),
      inboundWebhookSecret: z.string().optional(),
      imapHost: z.string().optional(),
      imapPort: z.number().int().positive().optional(),
      imapUsername: z.string().optional(),
      imapPassword: z.string().optional()
    })
  })
});

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
    status: z.enum(["active", "paused"]).default("active"),
    primaryContactEmail: z.string().email(),
    featureFlags: tenantFeatureFlagsSchema,
    config: tenantConfigSchema
  })
});

export const updateTenantSchema = z.object({
  params: z.object({
    tenantId: z.string().min(1)
  }),
  body: createTenantSchema.shape.body.partial()
});
