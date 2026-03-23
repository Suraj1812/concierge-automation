import { HydratedDocument, Schema, Types, model } from "mongoose";
import { conversationStates, type ConversationState } from "../../common/types/domain";

export interface ConversationMessage {
  direction: "inbound" | "outbound";
  role: "customer" | "assistant" | "system" | "ops";
  text: string;
  providerMessageId?: string;
  sentAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  customerId: Types.ObjectId;
  enquiryId?: Types.ObjectId;
  channel: "whatsapp";
  state: ConversationState;
  status: "active" | "paused" | "closed";
  lastInboundAt?: Date;
  lastOutboundAt?: Date;
  history: ConversationMessage[];
  pendingClarifications: string[];
  contextSnapshot?: string;
}

const conversationSchema = new Schema<Conversation>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", index: true },
    channel: { type: String, enum: ["whatsapp"], default: "whatsapp" },
    state: { type: String, enum: conversationStates, default: "collecting_requirements" },
    status: { type: String, enum: ["active", "paused", "closed"], default: "active" },
    lastInboundAt: { type: Date },
    lastOutboundAt: { type: Date },
    history: [
      {
        direction: { type: String, enum: ["inbound", "outbound"], required: true },
        role: { type: String, enum: ["customer", "assistant", "system", "ops"], required: true },
        text: { type: String, required: true },
        providerMessageId: { type: String },
        sentAt: { type: Date, required: true },
        metadata: { type: Schema.Types.Mixed }
      }
    ],
    pendingClarifications: [{ type: String }],
    contextSnapshot: { type: String }
  },
  {
    timestamps: true
  }
);

conversationSchema.index({ customerId: 1, status: 1, updatedAt: -1 });

export const ConversationModel = model<Conversation>("Conversation", conversationSchema);
export type ConversationDocument = HydratedDocument<Conversation>;
