import { Request, Response } from "express";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";
import { AppError } from "../../common/errors/AppError";
import { EmailAutomationService } from "./service";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";

export class EmailAutomationController {
  constructor(private readonly emailAutomationService: EmailAutomationService) {}

  private async verifySignature(rawBody: Buffer | undefined, signatureHeader?: string): Promise<boolean> {
    if (!rawBody || !signatureHeader) {
      return false;
    }

    const tenantConfig = await resolveCurrentTenantConfig();
    const expected = createHmacSha256(tenantConfig.integrations.email.inboundWebhookSecret || "", rawBody);
    const incoming = signatureHeader.replace("sha256=", "");
    return safeEqual(incoming, expected);
  }

  receiveWebhook = async (request: Request, response: Response): Promise<void> => {
    const isValid = await this.verifySignature(request.rawBody, request.headers["x-email-signature"] as string | undefined);
    if (!isValid) {
      throw new AppError("Invalid email webhook signature", 403, "INVALID_EMAIL_SIGNATURE");
    }

    const data = await this.emailAutomationService.ingestInboundEmail(request.body);
    response.status(202).json({ success: true, data });
  };

  list = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.emailAutomationService.list();
    response.status(200).json({ success: true, data });
  };
}
