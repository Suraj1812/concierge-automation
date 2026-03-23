import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError";
import { CustomerService } from "../users/service";
import { EnquiryService } from "../enquiries/service";
import { OpenAIService } from "../integrations/openai.service";
import { EmailService } from "../integrations/email.service";
import { EmailMessageRepository } from "./repository";
import { recordUsageEvent } from "../usage/recorder";
import { getEntityId } from "../../common/utils/entity";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { VendorService } from "../vendors/service";

export class EmailAutomationService {
  constructor(
    private readonly emailMessageRepository: EmailMessageRepository,
    private readonly customerService: CustomerService,
    private readonly enquiryService: EnquiryService,
    private readonly openAIService: OpenAIService,
    private readonly emailService: EmailService,
    private readonly vendorService: VendorService
  ) {}

  async ingestInboundEmail(payload: {
    from: string;
    to: string;
    subject: string;
    text: string;
    providerMessageId?: string;
  }) {
    const tenantConfig = await resolveCurrentTenantConfig();
    if (!tenantConfig.featureFlags.emailAutomation) {
      throw new AppError("Email automation is disabled for this tenant", 403, "EMAIL_AUTOMATION_DISABLED");
    }

    const customer = await this.customerService.upsertFromEmail({
      email: payload.from
    });

    const latestEnquiry = await this.enquiryService.getLatestActiveByCustomer(getEntityId(customer));
    const aiTurn = await this.openAIService.generateConciergeTurn({
      customerName: customer.name,
      customerMemory: customer.memorySummary,
      activeEnquirySummary: latestEnquiry?.summary,
      pendingClarifications: [],
      history: [],
      latestCustomerMessage: `${payload.subject}\n\n${payload.text}`
    });

    const enquiryUpdate = await this.enquiryService.createOrUpdateFromAi(getEntityId(customer), latestEnquiry, {
      title: aiTurn.title,
      summary: aiTurn.summary,
      serviceType: aiTurn.serviceType,
      extractedRequirements: aiTurn.extractedRequirements,
      missingFields: aiTurn.missingFields
    });

    await this.emailMessageRepository.create({
      customerId: new Types.ObjectId(getEntityId(customer)),
      enquiryId: new Types.ObjectId(getEntityId(enquiryUpdate.enquiry)),
      direction: "inbound",
      providerMessageId: payload.providerMessageId,
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text
    });

    await this.emailService.sendEmail(payload.from, `Re: ${payload.subject}`, aiTurn.replyText);

    await this.emailMessageRepository.create({
      customerId: new Types.ObjectId(getEntityId(customer)),
      enquiryId: new Types.ObjectId(getEntityId(enquiryUpdate.enquiry)),
      direction: "outbound",
      from: payload.to,
      to: payload.from,
      subject: `Re: ${payload.subject}`,
      text: aiTurn.replyText
    });

    if (aiTurn.nextAction === "vendor_match" && aiTurn.missingFields.length === 0) {
      await this.vendorService.matchAndDispatch(enquiryUpdate.enquiry);
    }

    await recordUsageEvent("channel.inbound.email", 1, {
      enquiryId: getEntityId(enquiryUpdate.enquiry)
    });

    return enquiryUpdate.enquiry;
  }

  async list(limit?: number) {
    return this.emailMessageRepository.list(limit);
  }
}
