import { AdminUser, AdminUserModel } from "./admin.model";

export class AuthRepository {
  async findByEmail(email: string) {
    return AdminUserModel.findOne({ email: email.toLowerCase() });
  }

  async create(payload: AdminUser): Promise<AdminUser> {
    const document = await AdminUserModel.create(payload);
    return document.toObject();
  }

  async updateLastLogin(id: string): Promise<void> {
    await AdminUserModel.findByIdAndUpdate(id, { $set: { lastLoginAt: new Date() } });
  }
}
