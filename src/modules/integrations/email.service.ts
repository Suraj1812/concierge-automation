import nodemailer, { Transporter } from "nodemailer";
import { env } from "../../config/env";

export class EmailService {
  private readonly transporter: Transporter | null;

  constructor() {
    this.transporter = env.SMTP_HOST
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          auth: env.SMTP_USER
            ? {
                user: env.SMTP_USER,
                pass: env.SMTP_PASS
              }
            : undefined
        })
      : null;
  }

  async sendVendorRequest(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      return;
    }

    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      text
    });
  }
}
