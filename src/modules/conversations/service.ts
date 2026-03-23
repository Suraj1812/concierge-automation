import { ConversationRepository } from "./repository";
import { CustomerService } from "../users/service";
import { EnquiryService } from "../enquiries/service";
import { OpenAIService } from "../integrations/openai.service";
import { NotificationService } from "../notifications/service";
import { VendorService } from "../vendors/service";
import { AuditService } from "../audit/service";
import { getEntityId } from "../../common/utils/entity";
import { customerFollowUpQueue } from "../../infrastructure/queue/queues";
import { env } from "../../config/env";
import { recordUsageEvent } from "../usage/recorder";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { getTenantIdFromEntity } from "../../common/utils/tenant";

export class ConversationService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly customerService: CustomerService,
    private readonly enquiryService: EnquiryService,
    private readonly openAIService: OpenAIService,
    private readonly notificationService: NotificationService,
    private readonly vendorService: VendorService,
    private readonly auditService: AuditService
  ) {}

  async list() {
    return this.conversationRepository.list();
  }

  async processClarificationFollowUp(payload: {
    conversationId: string;
    customerId: string;
    enquiryId: string;
    scheduledFrom: string;
  }): Promise<void> {
    const conversation = await this.conversationRepository.findById(payload.conversationId);
    const customer = await this.customerService.getById(payload.customerId);
    const enquiry = await this.enquiryService.getById(payload.enquiryId);

    if (!conversation || !customer || !enquiry) {
      return;
    }
    const tenantId = getTenantIdFromEntity(conversation) || getTenantIdFromEntity(customer) || getTenantIdFromEntity(enquiry) || getCurrentTenantId();

    const scheduledFrom = new Date(payload.scheduledFrom);
    if ((conversation.lastInboundAt && conversation.lastInboundAt > scheduledFrom) || enquiry.status !== "awaiting_clarification") {
      return;
    }

    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "clarification-reminder",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: `Just checking in on your ${enquiry.title.toLowerCase()} request. Once you share the remaining details, I can continue curating the best options for you right away.`
        },
        idempotencyKey: `clarification-reminder:${payload.conversationId}:${scheduledFrom.toISOString()}`,
        tenantId
      });
    }
  }

  async processInboundWhatsApp(payload: {
    phone: string;
    name?: string;
    whatsappUserId?: string;
    messageId: string;
    text: string;
  }): Promise<void> {
    const customer = await this.customerService.upsertFromWhatsApp({
      phone: payload.phone,
      name: payload.name,
      whatsappUserId: payload.whatsappUserId
    });
    await recordUsageEvent("channel.inbound.whatsapp", 1, {
      messageId: payload.messageId
    });
    const customerId = getEntityId(customer);
    const tenantId = getTenantIdFromEntity(customer) || getCurrentTenantId();

    let conversation = await this.conversationRepository.findActiveByCustomer(customerId);
    if (!conversation) {
      conversation = await this.conversationRepository.create(customerId);
    }

    await this.conversationRepository.appendMessage(getEntityId(conversation), {
      direction: "inbound",
      role: "customer",
      text: payload.text,
      providerMessageId: payload.messageId,
      sentAt: new Date()
    });

    const latestEnquiry = await this.enquiryService.getLatestActiveByCustomer(customerId);
    const history = [...(conversation.history ?? []), { role: "customer", text: payload.text, direction: "inbound", sentAt: new Date() }]
      .slice(-10)
      .map((item) => ({ role: item.role, text: item.text }));

    const aiTurn = await this.openAIService.generateConciergeTurn({
      customerName: customer.name,
      customerMemory: customer.memorySummary,
      activeEnquirySummary: latestEnquiry?.summary,
      pendingClarifications: conversation.pendingClarifications ?? [],
      history,
      latestCustomerMessage: payload.text
    });

    const enquiryUpdate = await this.enquiryService.createOrUpdateFromAi(customerId, latestEnquiry, {
      title: aiTurn.title,
      summary: aiTurn.summary,
      serviceType: aiTurn.serviceType,
      extractedRequirements: aiTurn.extractedRequirements,
      missingFields: aiTurn.missingFields
    });
    const enquiry = enquiryUpdate.enquiry;

    if (!conversation.enquiryId || conversation.enquiryId.toString() !== getEntityId(enquiry)) {
      await this.conversationRepository.attachEnquiry(getEntityId(conversation), getEntityId(enquiry));
    }

    await this.conversationRepository.updateState(
      getEntityId(conversation),
      aiTurn.nextState,
      aiTurn.missingFields,
      aiTurn.summary
    );

    if (aiTurn.memoryUpdate.shouldUpdate && aiTurn.memoryUpdate.summary) {
      await this.customerService.updateMemory(customerId, aiTurn.memoryUpdate.summary, aiTurn.memoryUpdate.preferences);
    }

    await this.notificationService.enqueue({
      type: "concierge-reply",
      channel: "whatsapp",
      recipient: customer.phone || payload.phone,
      body: {
        text: aiTurn.replyText
      },
      idempotencyKey: `reply:${payload.messageId}`,
      tenantId
    });

    await this.conversationRepository.appendMessage(getEntityId(conversation), {
      direction: "outbound",
      role: "assistant",
      text: aiTurn.replyText,
      sentAt: new Date()
    });

    if (aiTurn.nextAction === "clarify" || aiTurn.missingFields.length > 0) {
      const tenantConfig = await resolveCurrentTenantConfig();
      await customerFollowUpQueue.add(
        "conversation-clarification-follow-up",
        {
          tenantId,
          conversationId: getEntityId(conversation),
          customerId,
          enquiryId: getEntityId(enquiry),
          scheduledFrom: new Date().toISOString()
        },
        {
          delay: tenantConfig.automation.customerFollowUpMinutes * 60_000,
          jobId: `clarification-follow-up:${getEntityId(conversation)}:${payload.messageId}`
        }
      );
    }

    if (aiTurn.nextAction === "vendor_match" && aiTurn.missingFields.length === 0) {
      await this.vendorService.matchAndDispatch(enquiry);
    }

    await this.auditService.record({
      actorType: "customer",
      actorId: customerId,
      action: "conversation.inbound_processed",
      entityType: "Conversation",
      entityId: getEntityId(conversation),
      metadata: {
        enquiryId: getEntityId(enquiry),
        nextAction: aiTurn.nextAction,
        materialChangeDetected: enquiryUpdate.materialChangeDetected,
        createdNewEnquiry: enquiryUpdate.createdNewEnquiry
      }
    });
  }
}
