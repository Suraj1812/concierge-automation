import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { AuthRepository } from "./repository";
import { AdminUser } from "./admin.model";

export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async login(email: string, password: string): Promise<{ token: string; admin: Pick<AdminUser, "email" | "name" | "role"> }> {
    const admin = await this.authRepository.findByEmail(email);

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
        role: admin.role
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
        role: admin.role
      }
    };
  }

  async seedDefaultAdmin(): Promise<void> {
    const existing = await this.authRepository.findByEmail(env.ADMIN_EMAIL);

    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

    await this.authRepository.create({
      email: env.ADMIN_EMAIL,
      name: env.ADMIN_NAME,
      passwordHash,
      role: "super_admin",
      isActive: true
    });
  }
}
