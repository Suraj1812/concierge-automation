import { Request, Response } from "express";
import { conversationQueue } from "../../infrastructure/queue/queues";
import { WhatsAppService } from "./whatsapp.service";
import { WebhookReceiptRepository } from "./webhook-receipt.repository";
import { AppError } from "../../common/errors/AppError";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          id: string;
          from: string;
          timestamp?: string;
          type: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

export class WhatsAppWebhookController {
  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly webhookReceiptRepository: WebhookReceiptRepository
  ) {}

  verify = async (request: Request, response: Response): Promise<void> => {
    const challenge = await this.whatsAppService.verifyWebhookChallenge(
      request.query["hub.mode"] as string | undefined,
      request.query["hub.verify_token"] as string | undefined,
      request.query["hub.challenge"] as string | undefined
    );

    response.status(200).send(challenge);
  };

  receive = async (request: Request, response: Response): Promise<void> => {
    const isValid = await this.whatsAppService.verifySignature(
      request.rawBody,
      request.headers["x-hub-signature-256"] as string | undefined
    );

    if (!isValid) {
      throw new AppError("Invalid WhatsApp signature", 403, "INVALID_WHATSAPP_SIGNATURE");
    }

    const payload = request.body as WhatsAppWebhookPayload;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const contact = change.value?.contacts?.[0];
        for (const message of change.value?.messages ?? []) {
          if (message.type !== "text" || !message.text?.body) {
            continue;
          }

          const receiptState = await this.webhookReceiptRepository.tryStartProcessing(
            "whatsapp",
            message.id,
            request.headers["x-hub-signature-256"] as string | undefined
          );

          if (receiptState !== "acquired") {
            continue;
          }

          try {
            await conversationQueue.add(
              "whatsapp-inbound",
              {
                tenantId: request.tenant?.id,
                phone: message.from,
                name: contact?.profile?.name,
                whatsappUserId: contact?.wa_id,
                messageId: message.id,
                text: message.text.body
              },
              {
                jobId: `whatsapp:${message.id}`
              }
            );

            await this.webhookReceiptRepository.markCompleted(
              "whatsapp",
              message.id,
              request.headers["x-hub-signature-256"] as string | undefined
            );
          } catch (error) {
            await this.webhookReceiptRepository.markFailed(
              "whatsapp",
              message.id,
              (error as Error).message,
              request.headers["x-hub-signature-256"] as string | undefined
            );
            throw error;
          }
        }
      }
    }

    response.status(200).json({ success: true });
  };
}
