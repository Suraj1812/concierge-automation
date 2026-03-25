import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { AuthRepository } from "./repository";
import { AdminUser } from "./admin.model";
import { TenantService } from "../tenants/service";
import { getEntityId } from "../../common/utils/entity";

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly tenantService: TenantService
  ) {}

  async login(
    email: string,
    password: string,
    tenantSlug?: string
  ): Promise<{ token: string; admin: Pick<AdminUser, "email" | "name" | "role"> & { tenantId: string; tenantSlug: string } }> {
    const tenant = await this.tenantService.resolveBySlug(tenantSlug);
    const tenantId = getEntityId(tenant);
    const admin = await this.authRepository.findByEmail(email, tenantId);

    if (!admin || !admin.isActive) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);

    if (!isValidPassword) {
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    await this.authRepository.updateLastLogin(admin.id);

    const token = jwt.sign(
      {
        email: admin.email,
        role: admin.role,
        tenantId: admin.tenantId.toString(),
        tenantSlug: tenant.slug
      },
      env.JWT_SECRET,
      {
        subject: admin.id,
        expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"]
      }
    );

    return {
      token,
      admin: {
        email: admin.email,
        name: admin.name,
        role: admin.role,
        tenantId: admin.tenantId.toString(),
        tenantSlug: tenant.slug
      }
    };
  }

  async seedDefaultAdmin(): Promise<void> {
    const tenant = await this.tenantService.seedDefaultTenant();
    const tenantId = getEntityId(tenant);
    const existing = await this.authRepository.findByEmail(env.ADMIN_EMAIL, tenantId);

    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

    await this.authRepository.create({
      tenantId: new Types.ObjectId(tenantId),
      email: env.ADMIN_EMAIL,
      name: env.ADMIN_NAME,
      passwordHash,
      role: "super_admin",
      isActive: true
    });
  }
}
