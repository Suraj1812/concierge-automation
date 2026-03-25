import nodemailer, { Transporter } from "nodemailer";
import { AppError } from "../../common/errors/AppError";
import { logger } from "../../infrastructure/logging/logger";
import { retryAsync } from "../../common/utils/retry";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";

type TransporterCacheEntry = {
  transporter: Transporter | null;
  expiresAt: number;
};

export class EmailService {
  private transporterCache = new Map<string, TransporterCacheEntry>();
  private readonly cacheTtlMs = 10 * 60_000;
  private readonly maxCacheEntries = 100;

  private async getTransporter(): Promise<Transporter | null> {
    const tenantConfig = await resolveCurrentTenantConfig();
    const cacheKey = tenantConfig.tenantId || "default";
    const now = Date.now();

    const cached = this.transporterCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.transporter;
    }

    if (cached) {
      this.transporterCache.delete(cacheKey);
    }

    const transporter = tenantConfig.integrations.email.imapHost
      ? nodemailer.createTransport({
          host: tenantConfig.integrations.email.imapHost,
          port: tenantConfig.integrations.email.imapPort || 587,
          secure: false,
          auth: tenantConfig.integrations.email.imapUsername
            ? {
                user: tenantConfig.integrations.email.imapUsername,
                pass: tenantConfig.integrations.email.imapPassword
              }
            : undefined
        })
      : null;

    if (this.transporterCache.size >= this.maxCacheEntries) {
      const oldestKey = this.transporterCache.keys().next().value;
      if (oldestKey) {
        this.transporterCache.delete(oldestKey);
      }
    }

    this.transporterCache.set(cacheKey, {
      transporter,
      expiresAt: now + this.cacheTtlMs
    });
    return transporter;
  }

  async sendVendorRequest(to: string, subject: string, text: string): Promise<void> {
    await this.sendEmail(to, subject, text);
  }

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const transporter = await this.getTransporter();
    const tenantConfig = await resolveCurrentTenantConfig();
    if (!transporter) {
      logger.warn("SMTP transporter is not configured for tenant; email send skipped", {
        tenantId: tenantConfig.tenantId
      });
      return;
    }

    try {
      await retryAsync(
        async () => transporter.sendMail({
          from: tenantConfig.integrations.email.fromAddress,
          to,
          subject,
          text
        }),
        {
          attempts: 3,
          initialDelayMs: 250,
          maxDelayMs: 1_500,
          shouldRetry: (error) => {
            const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
            return ["ETIMEDOUT", "ECONNECTION", "ESOCKET", "ECONNRESET"].includes(code);
          }
        }
      );
    } catch (error) {
      throw new AppError("Failed to send email", 502, "EMAIL_SEND_FAILED", {
        cause: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
