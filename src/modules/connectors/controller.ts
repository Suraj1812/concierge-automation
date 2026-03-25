import crypto from "crypto";
import { Request, Response } from "express";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { sha256 } from "../../common/utils/crypto";
import { conversationQueue } from "../../infrastructure/queue/queues";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { EmailAutomationService } from "../emails/service";
import { VendorResponseService } from "../vendors/vendor-response.service";
import { WebhookReceiptRepository } from "../integrations/webhook-receipt.repository";

export class ConnectorController {
  constructor(
    private readonly emailAutomationService: EmailAutomationService,
    private readonly vendorResponseService: VendorResponseService,
    private readonly webhookReceiptRepository: WebhookReceiptRepository
  ) {}

  health = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({
      success: true,
      data: {
        status: "ok",
        tenant: request.tenant || null
      }
    });
  };

  queueWhatsAppInbound = async (request: Request, response: Response): Promise<void> => {
    const messageId = request.body.messageId || `connector-wa-${crypto.randomUUID()}`;
    const receiptState = await this.webhookReceiptRepository.tryStartProcessing(
      "whatsapp",
      messageId,
      request.correlationId
    );

    if (receiptState === "duplicate") {
      response.status(200).json({
        success: true,
        duplicate: true,
        data: {
          messageId
        }
      });
      return;
    }

    if (receiptState === "in_progress") {
      response.status(202).json({
        success: true,
        inProgress: true,
        data: {
          messageId
        }
      });
      return;
    }

    try {
      await conversationQueue.add(
        "whatsapp-inbound",
        {
          tenantId: request.tenant?.id,
          phone: request.body.phone,
          name: request.body.name,
          whatsappUserId: request.body.whatsappUserId,
          messageId,
          text: request.body.message
        },
        {
          jobId: `whatsapp:${messageId}`
        }
      );

      await this.webhookReceiptRepository.markCompleted("whatsapp", messageId, request.correlationId);

      response.status(202).json({
        success: true,
        data: {
          queued: true,
          messageId,
          tenantSlug: request.tenant?.slug,
          phone: request.body.phone
        },
        message: "WhatsApp connector message queued. Make sure the worker is running."
      });
    } catch (error) {
      await this.webhookReceiptRepository.markFailed(
        "whatsapp",
        messageId,
        (error as Error).message,
        request.correlationId
      );
      throw error;
    }
  };

  ingestEmailInbound = async (request: Request, response: Response): Promise<void> => {
    const tenantConfig = await resolveCurrentTenantConfig();
    const providerMessageId = request.body.providerMessageId || sha256(JSON.stringify(request.body));
    const receiptState = await this.webhookReceiptRepository.tryStartProcessing(
      "email",
      providerMessageId,
      request.correlationId
    );

    if (receiptState === "duplicate") {
      response.status(200).json({
        success: true,
        duplicate: true,
        data: {
          providerMessageId
        }
      });
      return;
    }

    if (receiptState === "in_progress") {
      response.status(202).json({
        success: true,
        inProgress: true,
        data: {
          providerMessageId
        }
      });
      return;
    }

    try {
      const data = await this.emailAutomationService.ingestInboundEmail({
        from: request.body.from,
        to: request.body.to || tenantConfig.integrations.email.fromAddress || env.SMTP_FROM,
        subject: request.body.subject,
        text: request.body.text,
        providerMessageId
      });

      await this.webhookReceiptRepository.markCompleted("email", providerMessageId, request.correlationId);

      response.status(202).json({
        success: true,
        data,
        message: "Email connector payload processed successfully."
      });
    } catch (error) {
      await this.webhookReceiptRepository.markFailed(
        "email",
        providerMessageId,
        (error as Error).message,
        request.correlationId
      );
      throw error;
    }
  };

  ingestVendorResponse = async (request: Request, response: Response): Promise<void> => {
    const eventId = request.body.externalEventId || sha256(JSON.stringify(request.body));
    const receiptState = await this.webhookReceiptRepository.tryStartProcessing(
      "vendor",
      eventId,
      request.correlationId
    );

    if (receiptState === "duplicate") {
      response.status(200).json({
        success: true,
        duplicate: true,
        data: {
          externalEventId: eventId
        }
      });
      return;
    }

    if (receiptState === "in_progress") {
      response.status(202).json({
        success: true,
        inProgress: true,
        data: {
          externalEventId: eventId
        }
      });
      return;
    }

    try {
      const data = await this.vendorResponseService.processReply({
        vendorReference: request.body.vendorReference,
        vendorId: request.body.vendorId,
        enquiryId: request.body.enquiryId,
        rawPayload: request.body.rawPayload,
        expiresAt: request.body.expiresAt
      });

      await this.webhookReceiptRepository.markCompleted("vendor", eventId, request.correlationId);

      response.status(202).json({
        success: true,
        data
      });
    } catch (error) {
      await this.webhookReceiptRepository.markFailed(
        "vendor",
        eventId,
        (error as Error).message,
        request.correlationId
      );
      throw error;
    }
  };
}
