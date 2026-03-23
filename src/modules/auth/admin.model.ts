import { HydratedDocument, Schema, Types, model } from "mongoose";

export interface AdminUser {
  tenantId: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: "super_admin" | "tenant_admin" | "ops_admin";
  isActive: boolean;
  lastLoginAt?: Date;
}

const adminUserSchema = new Schema<AdminUser>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["super_admin", "tenant_admin", "ops_admin"], default: "tenant_admin" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date }
  },
  {
    timestamps: true
  }
);

adminUserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const AdminUserModel = model<AdminUser>("AdminUser", adminUserSchema);
export type AdminUserDocument = HydratedDocument<AdminUser>;
