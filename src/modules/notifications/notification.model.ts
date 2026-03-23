import { HydratedDocument, Schema, model } from "mongoose";
import { communicationChannels, notificationStatuses } from "../../common/types/domain";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface Notification {
  type: string;
  channel: (typeof communicationChannels)[number];
  recipient: string;
  payload: Record<string, unknown>;
  status: (typeof notificationStatuses)[number];
  attempts: number;
  lastError?: string;
  scheduledAt?: Date;
  sentAt?: Date;
  processingStartedAt?: Date;
  lockExpiresAt?: Date;
  idempotencyKey: string;
}

const notificationSchema = new Schema<Notification>(
  {
    type: { type: String, required: true, index: true },
    channel: { type: String, enum: communicationChannels, required: true },
    recipient: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: notificationStatuses, default: "pending", index: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String },
    scheduledAt: { type: Date },
    sentAt: { type: Date },
    processingStartedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    idempotencyKey: { type: String, required: true, index: true }
  },
  {
    timestamps: true
  }
);

notificationSchema.plugin(tenantScopedPlugin);
notificationSchema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true });

export const NotificationModel = model<Notification>("Notification", notificationSchema);
export type NotificationDocument = HydratedDocument<Notification>;
