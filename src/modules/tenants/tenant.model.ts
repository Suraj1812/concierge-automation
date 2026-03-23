import { HydratedDocument, Schema, model } from "mongoose";

export interface TenantFeatureFlags {
  emailAutomation: boolean;
  customProposalTemplates: boolean;
  advancedDecisionEngine: boolean;
  vendorPortal: boolean;
  usageBilling: boolean;
}

export interface TenantConfig {
  ai: {
    tone: string;
    styleGuide?: string;
    fallbackReply: string;
    clarificationStrategy: string;
    hallucinationGuardrails: string[];
  };
  proposal: {
    companyName: string;
    accentColor: string;
    footerNote?: string;
    templateName: string;
  };
  automation: {
    vendorRetryLimit: number;
    customerFollowUpMinutes: number;
    paymentRetryLimit: number;
  };
  pricing: {
    serviceFeePercentage: number;
    minimumServiceFee: number;
    currency: string;
  };
  integrations: {
    vendorAutomation: {
      inboundWebhookSecret?: string;
    };
    whatsapp: {
      enabled: boolean;
      verifyToken?: string;
      appSecret?: string;
      phoneNumberId?: string;
      accessToken?: string;
      apiVersion?: string;
    };
    razorpay: {
      enabled: boolean;
      keyId?: string;
      keySecret?: string;
      webhookSecret?: string;
    };
    email: {
      enabled: boolean;
      fromAddress?: string;
      inboundWebhookSecret?: string;
      imapHost?: string;
      imapPort?: number;
      imapUsername?: string;
      imapPassword?: string;
    };
  };
}

export interface Tenant {
  name: string;
  slug: string;
  status: "active" | "paused";
  primaryContactEmail: string;
  featureFlags: TenantFeatureFlags;
  config: TenantConfig;
}

const tenantSchema = new Schema<Tenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    status: { type: String, enum: ["active", "paused"], default: "active", index: true },
    primaryContactEmail: { type: String, required: true, lowercase: true, trim: true },
    featureFlags: {
      emailAutomation: { type: Boolean, default: true },
      customProposalTemplates: { type: Boolean, default: true },
      advancedDecisionEngine: { type: Boolean, default: true },
      vendorPortal: { type: Boolean, default: false },
      usageBilling: { type: Boolean, default: true }
    },
    config: {
      ai: {
        tone: { type: String, default: "premium" },
        styleGuide: { type: String },
        fallbackReply: { type: String, default: "Thank you. Our concierge team is reviewing the request and will respond shortly." },
        clarificationStrategy: { type: String, default: "Ask only for the minimum missing details required to proceed." },
        hallucinationGuardrails: [{ type: String }]
      },
      proposal: {
        companyName: { type: String, default: "Luxury Concierge" },
        accentColor: { type: String, default: "#0F172A" },
        footerNote: { type: String },
        templateName: { type: String, default: "signature-premium" }
      },
      automation: {
        vendorRetryLimit: { type: Number, default: 3 },
        customerFollowUpMinutes: { type: Number, default: 180 },
        paymentRetryLimit: { type: Number, default: 3 }
      },
      pricing: {
        serviceFeePercentage: { type: Number, default: 0 },
        minimumServiceFee: { type: Number, default: 0 },
        currency: { type: String, default: "INR" }
      },
      integrations: {
        vendorAutomation: {
          inboundWebhookSecret: { type: String }
        },
        whatsapp: {
          enabled: { type: Boolean, default: true },
          verifyToken: { type: String },
          appSecret: { type: String },
          phoneNumberId: { type: String },
          accessToken: { type: String },
          apiVersion: { type: String, default: "v21.0" }
        },
        razorpay: {
          enabled: { type: Boolean, default: true },
          keyId: { type: String },
          keySecret: { type: String },
          webhookSecret: { type: String }
        },
        email: {
          enabled: { type: Boolean, default: true },
          fromAddress: { type: String },
          inboundWebhookSecret: { type: String },
          imapHost: { type: String },
          imapPort: { type: Number },
          imapUsername: { type: String },
          imapPassword: { type: String }
        }
      }
    }
  },
  {
    timestamps: true
  }
);

export const TenantModel = model<Tenant>("Tenant", tenantSchema);
export type TenantDocument = HydratedDocument<Tenant>;
