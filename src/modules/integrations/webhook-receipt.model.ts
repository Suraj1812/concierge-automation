import { HydratedDocument, Schema, model } from "mongoose";

export interface WebhookReceipt {
  provider: "whatsapp" | "razorpay" | "vendor";
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
    provider: { type: String, enum: ["whatsapp", "razorpay", "vendor"], required: true },
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

webhookReceiptSchema.index({ provider: 1, externalEventId: 1 }, { unique: true });

export const WebhookReceiptModel = model<WebhookReceipt>("WebhookReceipt", webhookReceiptSchema);
export type WebhookReceiptDocument = HydratedDocument<WebhookReceipt>;
