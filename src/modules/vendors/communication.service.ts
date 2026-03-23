import { env } from "../../config/env";
import { addMinutes } from "../../common/utils/date";
import { AppError } from "../../common/errors/AppError";
import { VendorRepository } from "./repository";
import { EnquiryRepository } from "../enquiries/repository";
import { WhatsAppService } from "../integrations/whatsapp.service";
import { EmailService } from "../integrations/email.service";
import { vendorFollowUpQueue } from "../../infrastructure/queue/queues";

export class VendorCommunicationService {
  constructor(
    private readonly vendorRepository: VendorRepository,
    private readonly enquiryRepository: EnquiryRepository,
    private readonly whatsAppService: WhatsAppService,
    private readonly emailService: EmailService
  ) {}

  async sendVendorRequest(vendorRequestId: string): Promise<void> {
    const vendorRequest = await this.vendorRepository.findVendorRequestById(vendorRequestId);

    if (!vendorRequest) {
      throw new AppError("Vendor request not found", 404, "VENDOR_REQUEST_NOT_FOUND");
    }

    const enquiry = await this.enquiryRepository.findById(vendorRequest.enquiryId.toString());
    const vendor = await this.vendorRepository.findById(vendorRequest.vendorId.toString());

    if (!enquiry || !vendor) {
      throw new AppError("Vendor request dependencies missing", 404, "VENDOR_REQUEST_DEPENDENCY_MISSING");
    }

    const message = [
      `Luxury concierge sourcing request`,
      `Reference: ${vendorRequest.vendorReference || "Pending reference"}`,
      `Service: ${enquiry.title}`,
      `Summary: ${enquiry.summary}`,
      `Requirements: ${JSON.stringify(enquiry.requirements)}`
    ].join("\n");

    const contact = vendor.contactPoints.find((item) => item.channel === vendorRequest.communicationChannel) || vendor.contactPoints[0];

    if (!contact) {
      throw new AppError("Vendor has no configured contact point", 422, "VENDOR_CONTACT_MISSING");
    }

    if (contact.channel === "whatsapp") {
      await this.whatsAppService.sendTextMessage(contact.value, message);
    } else if (contact.channel === "email") {
      await this.emailService.sendVendorRequest(contact.value, `Concierge request: ${enquiry.title}`, message);
    }

    const nextDueAt = addMinutes(new Date(), env.VENDOR_RESPONSE_TIMEOUT_MINUTES);
    await this.vendorRepository.incrementAttempt(vendorRequestId, nextDueAt);
    await this.vendorRepository.updateVendorRequestStatus(vendorRequestId, "sent", { responseDueAt: nextDueAt });

    await vendorFollowUpQueue.add(
      "vendor-follow-up",
      { vendorRequestId },
      {
        delay: env.VENDOR_RESPONSE_TIMEOUT_MINUTES * 60_000,
        jobId: `follow-up:${vendorRequestId}:${vendorRequest.attemptCount + 1}`
      }
    );
  }

  async followUpVendorRequest(vendorRequestId: string): Promise<void> {
    const vendorRequest = await this.vendorRepository.findVendorRequestById(vendorRequestId);

    if (!vendorRequest || !["queued", "sent"].includes(vendorRequest.status)) {
      return;
    }

    if (vendorRequest.attemptCount >= env.MAX_VENDOR_RETRY_ATTEMPTS) {
      await this.vendorRepository.updateVendorRequestStatus(vendorRequestId, "timed_out");
      return;
    }

    await this.sendVendorRequest(vendorRequestId);
  }
}
