import { HydratedDocument, Schema, Types, model } from "mongoose";
import { paymentStatuses } from "../../common/types/domain";

export interface PaymentWebhookEvent {
  eventId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  receivedAt: Date;
}

export interface PaymentOrderAttempt {
  orderId: string;
  receipt: string;
  createdAt: Date;
  status: "active" | "replaced" | "captured" | "failed";
}

export interface Payment {
  enquiryId: Types.ObjectId;
  bookingId?: Types.ObjectId;
  proposalId?: Types.ObjectId;
  amount: number;
  currency: string;
  status: (typeof paymentStatuses)[number];
  receipt: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  retryCount: number;
  expiresAt?: Date;
  orderHistory: PaymentOrderAttempt[];
  webhookEvents: PaymentWebhookEvent[];
  processingStartedAt?: Date;
  workflowLockExpiresAt?: Date;
  lastWorkflowError?: string;
}

const paymentSchema = new Schema<Payment>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    proposalId: { type: Schema.Types.ObjectId, ref: "Proposal" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    status: { type: String, enum: paymentStatuses, default: "created", index: true },
    receipt: { type: String, required: true, index: true },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String, index: true },
    razorpaySignature: { type: String },
    retryCount: { type: Number, default: 0 },
    expiresAt: { type: Date },
    orderHistory: [
      {
        orderId: { type: String, required: true },
        receipt: { type: String, required: true },
        createdAt: { type: Date, required: true },
        status: { type: String, enum: ["active", "replaced", "captured", "failed"], required: true }
      }
    ],
    webhookEvents: [
      {
        eventId: { type: String },
        eventType: { type: String, required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        receivedAt: { type: Date, required: true }
      }
    ],
    processingStartedAt: { type: Date },
    workflowLockExpiresAt: { type: Date, index: true },
    lastWorkflowError: { type: String }
  },
  {
    timestamps: true
  }
);

paymentSchema.index({ enquiryId: 1, createdAt: -1 });

export const PaymentModel = model<Payment>("Payment", paymentSchema);
export type PaymentDocument = HydratedDocument<Payment>;
