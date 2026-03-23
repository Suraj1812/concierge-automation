import { HydratedDocument, Schema, model } from "mongoose";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface AuditLog {
  actorType: "admin" | "customer" | "system" | "vendor";
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
}

const auditLogSchema = new Schema<AuditLog>(
  {
    actorType: { type: String, enum: ["admin", "customer", "system", "vendor"], required: true, index: true },
    actorId: { type: String },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    correlationId: { type: String, index: true }
  },
  {
    timestamps: true
  }
);

auditLogSchema.plugin(tenantScopedPlugin);

export const AuditLogModel = model<AuditLog>("AuditLog", auditLogSchema);
export type AuditLogDocument = HydratedDocument<AuditLog>;
