import nodemailer, { Transporter } from "nodemailer";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";

export class EmailService {
  private transporterCache = new Map<string, Transporter | null>();

  private async getTransporter(): Promise<Transporter | null> {
    const tenantConfig = await resolveCurrentTenantConfig();
    const cacheKey = tenantConfig.tenantId || "default";

    if (this.transporterCache.has(cacheKey)) {
      return this.transporterCache.get(cacheKey) || null;
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

    this.transporterCache.set(cacheKey, transporter);
    return transporter;
  }

  async sendVendorRequest(to: string, subject: string, text: string): Promise<void> {
    await this.sendEmail(to, subject, text);
  }

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const transporter = await this.getTransporter();
    const tenantConfig = await resolveCurrentTenantConfig();
    if (!transporter) {
      return;
    }

    await transporter.sendMail({
      from: tenantConfig.integrations.email.fromAddress,
      to,
      subject,
      text
    });
  }
}
