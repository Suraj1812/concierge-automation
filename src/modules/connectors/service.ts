import crypto from "crypto";
import { env } from "../../config/env";
import { sha256 } from "../../common/utils/crypto";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { EmailAutomationService } from "../emails/service";
import type { WebhookReceipt } from "../integrations/webhook-receipt.model";
import { VendorResponseService } from "../vendors/vendor-response.service";
import { WebhookReceiptRepository } from "../integrations/webhook-receipt.repository";

type ConnectorDuplicateResult = {
  status: "duplicate";
  eventId: string;
};

type ConnectorInProgressResult = {
  status: "in_progress";
  eventId: string;
};

type ConnectorAcceptedResult<T> = {
  status: "accepted";
  eventId: string;
  data: T;
};

export type ConnectorDispatchResult<T> =
  | ConnectorDuplicateResult
  | ConnectorInProgressResult
  | ConnectorAcceptedResult<T>;

export type QueueWhatsAppInboundJob = {
  tenantId?: string;
  phone: string;
  name?: string;
  whatsappUserId?: string;
  messageId: string;
  text: string;
};

type QueueWhatsAppInboundHandler = (payload: QueueWhatsAppInboundJob) => Promise<void>;

export class ConnectorService {
  constructor(
    private readonly emailAutomationService: EmailAutomationService,
    private readonly vendorResponseService: VendorResponseService,
    private readonly webhookReceiptRepository: WebhookReceiptRepository,
    private readonly queueWhatsAppInboundHandler: QueueWhatsAppInboundHandler
  ) {}

  private buildEventId(preferredId: string | undefined, payload: unknown, prefix: string): string {
    return preferredId || `${prefix}-${sha256(JSON.stringify(payload)).slice(0, 24)}`;
  }

  private async withReceipt<T>(
    provider: WebhookReceipt["provider"],
    eventId: string,
    correlationId: string | undefined,
    operation: () => Promise<T>
  ): Promise<ConnectorDispatchResult<T>> {
    const receiptState = await this.webhookReceiptRepository.tryStartProcessing(
      provider,
      eventId,
      correlationId
    );

    if (receiptState === "duplicate") {
      return {
        status: "duplicate",
        eventId
      };
    }

    if (receiptState === "in_progress") {
      return {
        status: "in_progress",
        eventId
      };
    }

    try {
      const data = await operation();
      await this.webhookReceiptRepository.markCompleted(provider, eventId, correlationId);

      return {
        status: "accepted",
        eventId,
        data
      };
    } catch (error) {
      await this.webhookReceiptRepository.markFailed(
        provider,
        eventId,
        (error as Error).message,
        correlationId
      );
      throw error;
    }
  }

  async queueWhatsAppInbound(payload: {
    tenantId?: string;
    tenantSlug?: string;
    phone: string;
    name?: string;
    whatsappUserId?: string;
    message: string;
    messageId?: string;
    correlationId?: string;
  }): Promise<ConnectorDispatchResult<{ queued: true; tenantSlug?: string; phone: string }>> {
    const eventId = payload.messageId || `connector-wa-${crypto.randomUUID()}`;

    return this.withReceipt("whatsapp", eventId, payload.correlationId, async () => {
      await this.queueWhatsAppInboundHandler({
        tenantId: payload.tenantId,
        phone: payload.phone,
        name: payload.name,
        whatsappUserId: payload.whatsappUserId,
        messageId: eventId,
        text: payload.message
      });

      return {
        queued: true as const,
        tenantSlug: payload.tenantSlug,
        phone: payload.phone
      };
    });
  }

  async ingestEmailInbound(payload: {
    from: string;
    to?: string;
    subject: string;
    text: string;
    providerMessageId?: string;
    correlationId?: string;
  }): Promise<ConnectorDispatchResult<Awaited<ReturnType<EmailAutomationService["ingestInboundEmail"]>>>> {
    const tenantConfig = await resolveCurrentTenantConfig();
    const eventId = this.buildEventId(payload.providerMessageId, payload, "connector-email");

    return this.withReceipt("email", eventId, payload.correlationId, async () =>
      this.emailAutomationService.ingestInboundEmail({
        from: payload.from,
        to: payload.to || tenantConfig.integrations.email.fromAddress || env.SMTP_FROM,
        subject: payload.subject,
        text: payload.text,
        providerMessageId: eventId
      })
    );
  }

  async ingestVendorResponse(payload: {
    vendorReference?: string;
    vendorId?: string;
    enquiryId?: string;
    rawPayload: string;
    expiresAt?: string;
    externalEventId?: string;
    correlationId?: string;
  }): Promise<ConnectorDispatchResult<Awaited<ReturnType<VendorResponseService["processReply"]>>>> {
    const eventId = this.buildEventId(payload.externalEventId, payload, "connector-vendor");

    return this.withReceipt("vendor", eventId, payload.correlationId, async () =>
      this.vendorResponseService.processReply({
        vendorReference: payload.vendorReference,
        vendorId: payload.vendorId,
        enquiryId: payload.enquiryId,
        rawPayload: payload.rawPayload,
        expiresAt: payload.expiresAt
      })
    );
  }
}
