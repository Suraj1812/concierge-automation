import { HydratedDocument, Schema, model } from "mongoose";

export interface AdminUser {
  name: string;
  email: string;
  passwordHash: string;
  role: "super_admin" | "ops_admin";
  isActive: boolean;
  lastLoginAt?: Date;
}

const adminUserSchema = new Schema<AdminUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["super_admin", "ops_admin"], default: "super_admin" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date }
  },
  {
    timestamps: true
  }
);

export const AdminUserModel = model<AdminUser>("AdminUser", adminUserSchema);
export type AdminUserDocument = HydratedDocument<AdminUser>;
