import axios from "axios";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";
import { AppError } from "../../common/errors/AppError";
import { CircuitBreaker } from "../../infrastructure/resilience/circuit-breaker";
import { withTimeout } from "../../common/utils/timeout";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";

export class WhatsAppService {
  private readonly circuitBreaker = new CircuitBreaker(5, 20_000);

  async verifyWebhookChallenge(mode?: string, token?: string, challenge?: string): Promise<string> {
    const tenantConfig = await resolveCurrentTenantConfig();
    if (mode !== "subscribe" || token !== tenantConfig.integrations.whatsapp.verifyToken || !challenge) {
      throw new AppError("Webhook verification failed", 403, "WHATSAPP_VERIFY_FAILED");
    }

    return challenge;
  }

  async verifySignature(rawBody: Buffer | undefined, signatureHeader?: string): Promise<boolean> {
    if (!rawBody || !signatureHeader) {
      return false;
    }

    const tenantConfig = await resolveCurrentTenantConfig();
    const signature = signatureHeader.replace("sha256=", "");
    const expected = createHmacSha256(tenantConfig.integrations.whatsapp.appSecret || "", rawBody);
    return safeEqual(signature, expected);
  }

  async sendTextMessage(to: string, text: string): Promise<void> {
    const tenantConfig = await resolveCurrentTenantConfig();
    const url = `https://graph.facebook.com/${tenantConfig.integrations.whatsapp.apiVersion}/${tenantConfig.integrations.whatsapp.phoneNumberId}/messages`;

    await this.circuitBreaker.execute(async () =>
      withTimeout(
        axios.post(
          url,
          {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: {
              preview_url: false,
              body: text
            }
          },
          {
            headers: {
              Authorization: `Bearer ${tenantConfig.integrations.whatsapp.accessToken}`,
              "Content-Type": "application/json"
            },
            timeout: 15_000
          }
        ),
        18_000,
        () => new AppError("WhatsApp send timeout", 504, "WHATSAPP_TIMEOUT")
      )
    );
  }

  async sendDocumentMessage(to: string, link: string, filename: string, caption: string): Promise<void> {
    const tenantConfig = await resolveCurrentTenantConfig();
    const url = `https://graph.facebook.com/${tenantConfig.integrations.whatsapp.apiVersion}/${tenantConfig.integrations.whatsapp.phoneNumberId}/messages`;

    await this.circuitBreaker.execute(async () =>
      withTimeout(
        axios.post(
          url,
          {
            messaging_product: "whatsapp",
            to,
            type: "document",
            document: {
              link,
              filename,
              caption
            }
          },
          {
            headers: {
              Authorization: `Bearer ${tenantConfig.integrations.whatsapp.accessToken}`,
              "Content-Type": "application/json"
            },
            timeout: 15_000
          }
        ),
        18_000,
        () => new AppError("WhatsApp document send timeout", 504, "WHATSAPP_TIMEOUT")
      )
    );
  }
}
