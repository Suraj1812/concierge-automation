import { env } from "../../config/env";
import { getEntityId } from "../../common/utils/entity";
import { getTenantContext } from "../../infrastructure/tenancy/tenant-context";
import { TenantRepository, type TenantRecord } from "./repository";
import type { TenantConfig, TenantFeatureFlags } from "./tenant.model";

export type ResolvedTenantConfig = {
  tenantId?: string;
  tenantName: string;
  featureFlags: TenantFeatureFlags;
} & TenantConfig;

const tenantRepository = new TenantRepository();

const getTenantId = (tenant: TenantRecord | null | undefined): string | undefined => {
  if (!tenant) {
    return undefined;
  }

  return getEntityId(tenant);
};

const buildDefaultTenantConfig = (): ResolvedTenantConfig => ({
  tenantId: undefined,
  tenantName: env.DEFAULT_TENANT_NAME,
  featureFlags: {
    emailAutomation: true,
    customProposalTemplates: true,
    advancedDecisionEngine: true,
    vendorPortal: false,
    usageBilling: true
  },
  ai: {
    tone: "premium",
    styleGuide: "Concise, polished, human, service-first.",
    fallbackReply: "Thank you. Our concierge team is reviewing the request and will respond shortly.",
    clarificationStrategy: "Ask only for the smallest missing set of details needed to continue.",
    hallucinationGuardrails: [
      "Never invent vendor availability.",
      "Never fabricate pricing or payment confirmation."
    ]
  },
  proposal: {
    companyName: env.DEFAULT_TENANT_NAME,
    accentColor: "#0F172A",
    footerNote: "Curated with care by your concierge team.",
    templateName: "signature-premium"
  },
  automation: {
    vendorRetryLimit: env.MAX_VENDOR_RETRY_ATTEMPTS,
    customerFollowUpMinutes: env.CUSTOMER_FOLLOW_UP_MINUTES,
    paymentRetryLimit: env.MAX_PAYMENT_RETRY_ATTEMPTS
  },
  pricing: {
    serviceFeePercentage: 0,
    minimumServiceFee: 0,
    currency: env.DEFAULT_CURRENCY
  },
  integrations: {
    vendorAutomation: {
      inboundWebhookSecret: env.VENDOR_WEBHOOK_SECRET
    },
    whatsapp: {
      enabled: true,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      appSecret: env.WHATSAPP_APP_SECRET,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: env.WHATSAPP_ACCESS_TOKEN,
      apiVersion: env.WHATSAPP_API_VERSION
    },
    razorpay: {
      enabled: true,
      keyId: env.RAZORPAY_KEY_ID,
      keySecret: env.RAZORPAY_KEY_SECRET,
      webhookSecret: env.RAZORPAY_WEBHOOK_SECRET
    },
    email: {
      enabled: true,
      fromAddress: env.SMTP_FROM,
      inboundWebhookSecret: env.EMAIL_WEBHOOK_SECRET,
      imapHost: env.SMTP_HOST,
      imapPort: env.SMTP_PORT,
      imapUsername: env.SMTP_USER,
      imapPassword: env.SMTP_PASS
    }
  }
});

export const buildResolvedTenantConfig = (tenant?: TenantRecord | null): ResolvedTenantConfig => {
  if (!tenant) {
    return buildDefaultTenantConfig();
  }

  return {
    tenantId: getTenantId(tenant),
    tenantName: tenant.name,
    featureFlags: tenant.featureFlags,
    ...tenant.config
  };
};

export const resolveCurrentTenantConfig = async (): Promise<ResolvedTenantConfig> => {
  const context = getTenantContext();
  if (context?.tenantConfig) {
    return context.tenantConfig;
  }

  if (!context?.tenantId) {
    return buildDefaultTenantConfig();
  }

  const tenant = await tenantRepository.findById(context.tenantId);
  const resolved = buildResolvedTenantConfig(tenant);

  context.tenantSlug = context.tenantSlug ?? tenant?.slug;
  context.tenantName = context.tenantName ?? tenant?.name;
  context.tenantConfig = resolved;

  return resolved;
};
