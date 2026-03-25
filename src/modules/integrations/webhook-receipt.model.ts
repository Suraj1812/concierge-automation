import { HydratedDocument, Schema, model } from "mongoose";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface WebhookReceipt {
  provider: "whatsapp" | "razorpay" | "vendor" | "email";
  externalEventId: string;
  signature?: string;
  status: "processing" | "completed" | "failed";
  processingAttempts: number;
  processingStartedAt?: Date;
  lockExpiresAt?: Date;
  processedAt?: Date;
  lastError?: string;
}

const webhookReceiptSchema = new Schema<WebhookReceipt>(
  {
    provider: { type: String, enum: ["whatsapp", "razorpay", "vendor", "email"], required: true },
    externalEventId: { type: String, required: true },
    signature: { type: String },
    status: { type: String, enum: ["processing", "completed", "failed"], required: true, default: "processing", index: true },
    processingAttempts: { type: Number, default: 0 },
    processingStartedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    processedAt: { type: Date },
    lastError: { type: String }
  },
  {
    timestamps: true
  }
);

webhookReceiptSchema.plugin(tenantScopedPlugin);
webhookReceiptSchema.index({ tenantId: 1, provider: 1, externalEventId: 1 }, { unique: true });

export const WebhookReceiptModel = model<WebhookReceipt>("WebhookReceipt", webhookReceiptSchema);
export type WebhookReceiptDocument = HydratedDocument<WebhookReceipt>;
