import axios from "axios";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";
import { AppError } from "../../common/errors/AppError";
import { CircuitBreaker } from "../../infrastructure/resilience/circuit-breaker";
import { withTimeout } from "../../common/utils/timeout";
import { retryAsync } from "../../common/utils/retry";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";

export class WhatsAppService {
  private readonly circuitBreaker = new CircuitBreaker(5, 20_000);

  private shouldRetry(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return error instanceof AppError && error.code === "WHATSAPP_TIMEOUT";
    }

    if (!error.response) {
      return true;
    }

    return error.response.status === 429 || error.response.status >= 500;
  }

  private normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      return new AppError("WhatsApp API request failed", error.response?.status || 502, "WHATSAPP_SEND_FAILED", {
        cause: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    }

    if (error instanceof Error && error.message === "Circuit breaker is open") {
      return new AppError("WhatsApp provider is temporarily unavailable", 503, "WHATSAPP_PROVIDER_UNAVAILABLE");
    }

    return new AppError("WhatsApp send failed", 502, "WHATSAPP_SEND_FAILED", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  private async postMessage(body: Record<string, unknown>, timeoutMessage: string): Promise<void> {
    const tenantConfig = await resolveCurrentTenantConfig();
    const url = `https://graph.facebook.com/${tenantConfig.integrations.whatsapp.apiVersion}/${tenantConfig.integrations.whatsapp.phoneNumberId}/messages`;

    try {
      await this.circuitBreaker.execute(async () =>
        retryAsync(
          async () =>
            withTimeout(
              axios.post(
                url,
                body,
                {
                  headers: {
                    Authorization: `Bearer ${tenantConfig.integrations.whatsapp.accessToken}`,
                    "Content-Type": "application/json"
                  },
                  timeout: 15_000
                }
              ),
              18_000,
              () => new AppError(timeoutMessage, 504, "WHATSAPP_TIMEOUT")
            ),
          {
            attempts: 3,
            initialDelayMs: 300,
            maxDelayMs: 1_500,
            shouldRetry: (error) => this.shouldRetry(error)
          }
        )
      );
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

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
    await this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text
      }
    }, "WhatsApp send timeout");
  }

  async sendDocumentMessage(to: string, link: string, filename: string, caption: string): Promise<void> {
    await this.postMessage({
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        link,
        filename,
        caption
      }
    }, "WhatsApp document send timeout");
  }
}
