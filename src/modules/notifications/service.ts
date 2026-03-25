import { AppError } from "../../common/errors/AppError";
import { notificationQueue } from "../../infrastructure/queue/queues";
import { Notification } from "./notification.model";
import { NotificationRepository } from "./repository";
import { WhatsAppService } from "../integrations/whatsapp.service";
import { EmailService } from "../integrations/email.service";
import { getEntityId } from "../../common/utils/entity";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";

export class NotificationService {
  constructor(
    private readonly notificationRepository: NotificationRepository,
    private readonly whatsAppService: WhatsAppService,
    private readonly emailService: EmailService
  ) {}

  async enqueue(payload: {
    type: string;
    channel: Notification["channel"];
    recipient: string;
    body: Record<string, unknown>;
    idempotencyKey: string;
    tenantId?: string;
    delayMs?: number;
  }): Promise<void> {
    const recipient = payload.recipient.trim();
    if (!recipient) {
      throw new AppError("Notification recipient is required", 422, "NOTIFICATION_RECIPIENT_MISSING");
    }

    let notification;
    try {
      notification = await this.notificationRepository.create({
        type: payload.type,
        channel: payload.channel,
        recipient,
        payload: payload.body,
        status: "pending",
        attempts: 0,
        scheduledAt: payload.delayMs ? new Date(Date.now() + payload.delayMs) : new Date(),
        idempotencyKey: payload.idempotencyKey,
        ...(payload.tenantId ? { tenantId: payload.tenantId } : {})
      });
    } catch (error) {
      const duplicateKeyErrorCode = 11000;
      if ((error as { code?: number }).code === duplicateKeyErrorCode) {
        return;
      }
      throw error;
    }

    try {
      await notificationQueue.add(
        payload.type,
        {
          tenantId: payload.tenantId || getCurrentTenantId(),
          notificationId: getEntityId(notification)
        },
        {
          delay: payload.delayMs,
          jobId: payload.idempotencyKey
        }
      );
    } catch (error) {
      await this.notificationRepository.markQueueingFailure(getEntityId(notification), (error as Error).message);
      throw error;
    }
  }

  async process(notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.claimForProcessing(notificationId);

    if (!notification) {
      const existing = await this.notificationRepository.findById(notificationId);
      if (!existing || existing.status === "sent") {
        return;
      }

      return;
    }

    try {
      if (notification.channel === "whatsapp") {
        const link = notification.payload.link as string | undefined;
        const text = notification.payload.text as string | undefined;

        if (link) {
          await this.whatsAppService.sendDocumentMessage(
            notification.recipient,
            link,
            (notification.payload.filename as string) || "proposal.pdf",
            (notification.payload.caption as string) || ""
          );
        } else if (text) {
          await this.whatsAppService.sendTextMessage(notification.recipient, text);
        } else {
          throw new AppError("WhatsApp notification payload must include text or link", 422, "INVALID_NOTIFICATION_PAYLOAD");
        }
      } else if (notification.channel === "email") {
        await this.emailService.sendEmail(
          notification.recipient,
          (notification.payload.subject as string) || notification.type,
          (notification.payload.text as string) || ""
        );
      } else {
        throw new AppError(`Unsupported notification channel: ${notification.channel}`, 422, "UNSUPPORTED_NOTIFICATION_CHANNEL");
      }

      await this.notificationRepository.markSent(notificationId);
    } catch (error) {
      await this.notificationRepository.markFailed(notificationId, (error as Error).message);
      throw error;
    }
  }
}
