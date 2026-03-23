import axios from "axios";
import { env } from "../../config/env";
import { createHmacSha256, safeEqual } from "../../common/utils/crypto";
import { AppError } from "../../common/errors/AppError";

export class WhatsAppService {
  verifyWebhookChallenge(mode?: string, token?: string, challenge?: string): string {
    if (mode !== "subscribe" || token !== env.WHATSAPP_VERIFY_TOKEN || !challenge) {
      throw new AppError("Webhook verification failed", 403, "WHATSAPP_VERIFY_FAILED");
    }

    return challenge;
  }

  verifySignature(rawBody: Buffer | undefined, signatureHeader?: string): boolean {
    if (!rawBody || !signatureHeader) {
      return false;
    }

    const signature = signatureHeader.replace("sha256=", "");
    const expected = createHmacSha256(env.WHATSAPP_APP_SECRET, rawBody);
    return safeEqual(signature, expected);
  }

  async sendTextMessage(to: string, text: string): Promise<void> {
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    await axios.post(
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
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15_000
      }
    );
  }

  async sendDocumentMessage(to: string, link: string, filename: string, caption: string): Promise<void> {
    const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    await axios.post(
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
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15_000
      }
    );
  }
}
