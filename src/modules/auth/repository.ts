import { AdminUser, AdminUserModel } from "./admin.model";
import { Types } from "mongoose";

export class AuthRepository {
  async findByEmail(email: string, tenantId: string) {
    return AdminUserModel.findOne({
      email: email.toLowerCase(),
      tenantId: new Types.ObjectId(tenantId)
    });
  }

  async create(payload: AdminUser): Promise<AdminUser> {
    const document = await AdminUserModel.create(payload);
    return document.toObject();
  }

  async updateLastLogin(id: string): Promise<void> {
    await AdminUserModel.findByIdAndUpdate(id, { $set: { lastLoginAt: new Date() } });
  }
}
