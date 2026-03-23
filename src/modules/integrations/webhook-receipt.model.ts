import { HydratedDocument, Schema, model } from "mongoose";

export interface WebhookReceipt {
  provider: "whatsapp" | "razorpay" | "vendor";
  externalEventId: string;
  signature?: string;
  processedAt: Date;
}

const webhookReceiptSchema = new Schema<WebhookReceipt>(
  {
    provider: { type: String, enum: ["whatsapp", "razorpay", "vendor"], required: true },
    externalEventId: { type: String, required: true },
    signature: { type: String },
    processedAt: { type: Date, required: true }
  },
  {
    timestamps: true
  }
);

webhookReceiptSchema.index({ provider: 1, externalEventId: 1 }, { unique: true });

export const WebhookReceiptModel = model<WebhookReceipt>("WebhookReceipt", webhookReceiptSchema);
export type WebhookReceiptDocument = HydratedDocument<WebhookReceipt>;
