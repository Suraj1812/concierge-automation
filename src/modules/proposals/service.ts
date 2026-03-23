import path from "path";
import { Types } from "mongoose";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { ProposalRepository } from "./repository";
import { QuoteRepository } from "../quotes/repository";
import { EnquiryRepository } from "../enquiries/repository";
import { CustomerRepository } from "../users/repository";
import { VendorRepository } from "../vendors/repository";
import { PdfService } from "../integrations/pdf.service";
import { OpenAIService } from "../integrations/openai.service";
import { NotificationService } from "../notifications/service";
import { DecisionEngineService } from "../quotes/decision-engine.service";
import { getEntityId } from "../../common/utils/entity";
import { customerFollowUpQueue } from "../../infrastructure/queue/queues";

export class ProposalService {
  constructor(
    private readonly proposalRepository: ProposalRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly enquiryRepository: EnquiryRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly vendorRepository: VendorRepository,
    private readonly pdfService: PdfService,
    private readonly openAIService: OpenAIService,
    private readonly notificationService: NotificationService,
    private readonly decisionEngineService: DecisionEngineService
  ) {}

  async getById(proposalId: string) {
    return this.proposalRepository.findById(proposalId);
  }

  async getLatestByEnquiry(enquiryId: string) {
    return this.proposalRepository.findLatestByEnquiry(enquiryId);
  }

  async generateForEnquiry(enquiryId: string) {
    const enquiry = await this.enquiryRepository.findById(enquiryId);
    if (!enquiry) {
      throw new AppError("Enquiry not found", 404, "ENQUIRY_NOT_FOUND");
    }

    const customer = await this.customerRepository.findById(enquiry.customerId.toString());
    if (!customer) {
      throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
    }

    const quotes = await this.quoteRepository.findByEnquiry(enquiryId);
    const vendors = await this.vendorRepository.list();
    const ranked = this.decisionEngineService.rankQuotes(enquiry, quotes, vendors);

    if (ranked.length === 0) {
      throw new AppError("No normalized quotes available for proposal generation", 422, "NO_QUOTES");
    }

    const recommended = ranked[0];
    const alternatives = ranked.slice(1, 3);
    const copy = await this.openAIService.generateProposalCopy({
      customerName: customer.name,
      enquiryTitle: enquiry.title,
      enquirySummary: enquiry.summary,
      recommendation: {
        title: recommended.normalizedOffer?.title,
        totalAmount: recommended.normalizedOffer?.totalAmount,
        currency: recommended.normalizedOffer?.currency,
        highlights: recommended.normalizedOffer?.inclusions
      },
      alternatives: alternatives.map((quote) => ({
        title: quote.normalizedOffer?.title,
        totalAmount: quote.normalizedOffer?.totalAmount,
        currency: quote.normalizedOffer?.currency,
        highlights: quote.normalizedOffer?.inclusions
      })),
      customerMemory: customer.memorySummary
    });

    const proposalRef = new Types.ObjectId().toString();
    const pdfPath = await this.pdfService.generateProposalPdf({
      proposalId: proposalRef,
      customerName: customer.name,
      enquiryTitle: enquiry.title,
      summary: copy.summary,
      recommendation: {
        title: recommended.normalizedOffer?.title || "Recommended option",
        totalAmount: recommended.normalizedOffer?.totalAmount || 0,
        currency: recommended.normalizedOffer?.currency || env.DEFAULT_CURRENCY,
        highlights: recommended.normalizedOffer?.inclusions || []
      },
      alternatives: alternatives.map((quote) => ({
        title: quote.normalizedOffer?.title || "Alternative option",
        totalAmount: quote.normalizedOffer?.totalAmount || 0,
        currency: quote.normalizedOffer?.currency || env.DEFAULT_CURRENCY,
        highlights: quote.normalizedOffer?.inclusions || []
      }))
    });

    const latest = await this.proposalRepository.findLatestByEnquiry(enquiryId);
    const proposal = await this.proposalRepository.create({
      enquiryId: new Types.ObjectId(enquiryId),
      customerId: new Types.ObjectId(getEntityId(customer)),
      quoteIds: ranked.map((quote) => new Types.ObjectId(getEntityId(quote))),
      recommendedQuoteId: new Types.ObjectId(getEntityId(recommended)),
      summary: copy.summary,
      premiumMessage: copy.premiumMessage,
      pdfPath,
      status: "sent",
      version: (latest?.version ?? 0) + 1
    });

    await this.enquiryRepository.update(enquiryId, {
      proposalId: new Types.ObjectId(getEntityId(proposal)),
      selectedQuoteId: new Types.ObjectId(getEntityId(recommended)),
      status: "proposal_sent"
    });

    const pdfUrl = `${env.APP_BASE_URL}/storage/proposals/${path.basename(pdfPath)}`;
    await this.notificationService.enqueue({
      type: "proposal-message",
      channel: "whatsapp",
      recipient: customer.phone,
      body: {
        text: copy.premiumMessage
      },
      idempotencyKey: `proposal-text:${getEntityId(proposal)}`
    });

    await this.notificationService.enqueue({
      type: "proposal-document",
      channel: "whatsapp",
      recipient: customer.phone,
      body: {
        link: pdfUrl,
        filename: path.basename(pdfPath),
        caption: "Your curated concierge proposal"
      },
      idempotencyKey: `proposal-doc:${getEntityId(proposal)}`
    });

    await customerFollowUpQueue.add(
      "proposal-review-follow-up",
      {
        proposalId: getEntityId(proposal)
      },
      {
        delay: env.CUSTOMER_FOLLOW_UP_MINUTES * 60_000,
        jobId: `proposal-review-follow-up:${getEntityId(proposal)}`
      }
    );

    return proposal;
  }

  async processProposalFollowUp(proposalId: string): Promise<void> {
    const proposal = await this.proposalRepository.findById(proposalId);
    if (!proposal) {
      return;
    }

    const enquiry = await this.enquiryRepository.findById(proposal.enquiryId.toString());
    const customer = await this.customerRepository.findById(proposal.customerId.toString());

    if (!enquiry || !customer || !["proposal_sent", "payment_pending"].includes(enquiry.status)) {
      return;
    }

    await this.notificationService.enqueue({
      type: "proposal-review-reminder",
      channel: "whatsapp",
      recipient: customer.phone,
      body: {
        text: "A gentle follow-up on your curated proposal. If you would like, I can walk you through the recommended option or refine the shortlist further before we proceed."
      },
      idempotencyKey: `proposal-review-reminder:${proposalId}`
    });
  }
}
