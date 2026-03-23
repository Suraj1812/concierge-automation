import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { TenantRepository } from "./repository";
import { Tenant } from "./tenant.model";

export class TenantService {
  constructor(private readonly tenantRepository: TenantRepository) {}

  async seedDefaultTenant(): Promise<Tenant> {
    const existing = await this.tenantRepository.findBySlug(env.DEFAULT_TENANT_SLUG);
    if (existing) {
      return existing;
    }

    return this.tenantRepository.create({
      name: env.DEFAULT_TENANT_NAME,
      slug: env.DEFAULT_TENANT_SLUG,
      status: "active",
      primaryContactEmail: env.ADMIN_EMAIL,
      featureFlags: {
        emailAutomation: true,
        customProposalTemplates: true,
        advancedDecisionEngine: true,
        vendorPortal: false,
        usageBilling: true
      },
      config: {
        ai: {
          tone: "premium",
          styleGuide: "Concise, polished, human, service-first.",
          fallbackReply: "Thank you. Our concierge team is reviewing the request and will respond shortly.",
          clarificationStrategy: "Ask only for the smallest missing set of details needed to continue.",
          hallucinationGuardrails: [
            "Never invent vendor availability.",
            "Never fabricate pricing or payment confirmation.",
            "Use clarification questions when required information is missing."
          ]
        },
        proposal: {
          companyName: env.DEFAULT_TENANT_NAME,
          accentColor: "#0F172A",
          templateName: "signature-premium",
          footerNote: "Curated with care by your concierge team."
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
      }
    });
  }

  async resolveById(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant || tenant.status !== "active") {
      throw new AppError("Tenant is unavailable", 403, "TENANT_UNAVAILABLE");
    }

    return tenant;
  }

  async resolveBySlug(slug?: string): Promise<Tenant> {
    const candidateSlug = slug || env.DEFAULT_TENANT_SLUG;
    const tenant = await this.tenantRepository.findBySlug(candidateSlug);
    if (!tenant || tenant.status !== "active") {
      throw new AppError("Tenant not found", 404, "TENANT_NOT_FOUND");
    }

    return tenant;
  }

  async list(): Promise<Tenant[]> {
    return this.tenantRepository.list();
  }

  async create(payload: Tenant): Promise<Tenant> {
    return this.tenantRepository.create(payload);
  }

  async update(tenantId: string, payload: Partial<Tenant>): Promise<Tenant | null> {
    return this.tenantRepository.update(tenantId, payload);
  }
}
