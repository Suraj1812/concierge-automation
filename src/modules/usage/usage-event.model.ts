import { HydratedDocument, Schema, model } from "mongoose";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface UsageEvent {
  metric: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

const usageEventSchema = new Schema<UsageEvent>(
  {
    metric: { type: String, required: true, index: true },
    quantity: { type: Number, default: 1 },
    metadata: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true
  }
);

usageEventSchema.plugin(tenantScopedPlugin);
usageEventSchema.index({ tenantId: 1, metric: 1, createdAt: -1 });

export const UsageEventModel = model<UsageEvent>("UsageEvent", usageEventSchema);
export type UsageEventDocument = HydratedDocument<UsageEvent>;
