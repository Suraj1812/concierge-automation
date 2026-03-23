import { HydratedDocument, Schema, Types, model } from "mongoose";
import { quoteStatuses } from "../../common/types/domain";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface NormalizedQuote {
  title: string;
  inclusions: string[];
  exclusions: string[];
  totalAmount: number;
  currency: string;
  terms: string[];
  availabilityStatus: string;
  cancellationPolicy?: string;
}

export interface QuoteScoreBreakdown {
  priceScore: number;
  fitScore: number;
  vendorReliabilityScore: number;
  responseSpeedScore: number;
  totalScore: number;
}

export interface Quote {
  enquiryId: Types.ObjectId;
  vendorId: Types.ObjectId;
  rawPayload: string;
  normalizedOffer?: NormalizedQuote;
  status: (typeof quoteStatuses)[number];
  aiSummary?: string;
  scoreBreakdown?: QuoteScoreBreakdown;
  expiresAt?: Date;
}

const quoteSchema = new Schema<Quote>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    rawPayload: { type: String, required: true },
    normalizedOffer: {
      title: { type: String },
      inclusions: [{ type: String }],
      exclusions: [{ type: String }],
      totalAmount: { type: Number },
      currency: { type: String },
      terms: [{ type: String }],
      availabilityStatus: { type: String },
      cancellationPolicy: { type: String }
    },
    status: { type: String, enum: quoteStatuses, default: "received", index: true },
    aiSummary: { type: String },
    scoreBreakdown: {
      priceScore: { type: Number },
      fitScore: { type: Number },
      vendorReliabilityScore: { type: Number },
      responseSpeedScore: { type: Number },
      totalScore: { type: Number }
    },
    expiresAt: { type: Date }
  },
  {
    timestamps: true
  }
);

quoteSchema.index({ enquiryId: 1, vendorId: 1 });
quoteSchema.plugin(tenantScopedPlugin);

export const QuoteModel = model<Quote>("Quote", quoteSchema);
export type QuoteDocument = HydratedDocument<Quote>;
