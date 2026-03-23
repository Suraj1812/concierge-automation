import { HydratedDocument, Schema, Types, model } from "mongoose";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface EmailMessage {
  customerId?: Types.ObjectId;
  enquiryId?: Types.ObjectId;
  direction: "inbound" | "outbound";
  providerMessageId?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}

const emailMessageSchema = new Schema<EmailMessage>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry" },
    direction: { type: String, enum: ["inbound", "outbound"], required: true, index: true },
    providerMessageId: { type: String, index: true },
    from: { type: String, required: true, lowercase: true, trim: true },
    to: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true },
    text: { type: String, required: true }
  },
  {
    timestamps: true
  }
);

emailMessageSchema.plugin(tenantScopedPlugin);

export const EmailMessageModel = model<EmailMessage>("EmailMessage", emailMessageSchema);
export type EmailMessageDocument = HydratedDocument<EmailMessage>;
