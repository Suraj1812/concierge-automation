import path from "path";
import crypto from "crypto";
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
import { sha256 } from "../../common/utils/crypto";
import { customerFollowUpQueue } from "../../infrastructure/queue/queues";
import { recordUsageEvent } from "../usage/recorder";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { getTenantIdFromEntity } from "../../common/utils/tenant";

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

  private buildQuoteSignature(rankedQuoteIds: string[]): string {
    return sha256(rankedQuoteIds.join("|"));
  }

  private buildDocumentUrl(proposalId: string, accessToken: string): string {
    return `${env.APP_BASE_URL}/api/proposals/shared/${proposalId}/document?token=${accessToken}`;
  }

  async getDocumentForSharing(proposalId: string, accessToken: string): Promise<{ filePath: string }> {
    const proposal = await this.proposalRepository.findByAccessTokenHash(proposalId, sha256(accessToken));
    if (!proposal) {
      throw new AppError("Proposal document access is invalid", 404, "PROPOSAL_DOCUMENT_NOT_FOUND");
    }

    if (proposal.status === "superseded") {
      throw new AppError("Proposal document has been superseded by a newer version", 410, "PROPOSAL_DOCUMENT_SUPERSEDED");
    }

    return {
      filePath: path.resolve(proposal.pdfPath)
    };
  }

  async generateForEnquiry(enquiryId: string) {
    const enquiry = await this.enquiryRepository.findById(enquiryId);
    if (!enquiry) {
      throw new AppError("Enquiry not found", 404, "ENQUIRY_NOT_FOUND");
    }

    if (["payment_pending", "payment_authorized", "booked", "completed", "cancelled"].includes(enquiry.status)) {
      return null;
    }

    const customer = await this.customerRepository.findById(enquiry.customerId.toString());
    if (!customer) {
      throw new AppError("Customer not found", 404, "CUSTOMER_NOT_FOUND");
    }
    const tenantId = getTenantIdFromEntity(enquiry) || getTenantIdFromEntity(customer) || getCurrentTenantId();

    const quotes = await this.quoteRepository.findByEnquiry(enquiryId);
    const vendors = await this.vendorRepository.list();
    const ranked = this.decisionEngineService.rankQuotes(enquiry, quotes, vendors);
    const normalizedQuotes = ranked.filter((quote) => Boolean(quote.normalizedOffer));

    if (normalizedQuotes.length === 0) {
      return null;
    }

    const openVendorRequests = await this.vendorRepository.findOpenVendorRequestsByEnquiry(enquiryId);
    if (openVendorRequests.length > 0) {
      return null;
    }

    const quoteSignature = this.buildQuoteSignature(normalizedQuotes.map((quote) => getEntityId(quote)).sort());
    const latest = await this.proposalRepository.findLatestByEnquiry(enquiryId);
    if (latest?.quoteSignature === quoteSignature) {
      return latest;
    }

    if (latest && latest.status !== "superseded") {
      await this.proposalRepository.updateStatus(getEntityId(latest), "superseded");
    }

    const recommended = normalizedQuotes[0];
    const alternatives = normalizedQuotes.slice(1, 3);
    const tenantConfig = await resolveCurrentTenantConfig();
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
    const accessToken = crypto.randomBytes(24).toString("hex");
    const pdfPath = await this.pdfService.generateProposalPdf({
      proposalId: proposalRef,
      companyName: tenantConfig.proposal.companyName,
      footerNote: tenantConfig.proposal.footerNote,
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

    const proposal = await this.proposalRepository.create({
      enquiryId: new Types.ObjectId(enquiryId),
      customerId: new Types.ObjectId(getEntityId(customer)),
      quoteIds: normalizedQuotes.map((quote) => new Types.ObjectId(getEntityId(quote))),
      recommendedQuoteId: new Types.ObjectId(getEntityId(recommended)),
      summary: copy.summary,
      premiumMessage: copy.premiumMessage,
      pdfPath,
      quoteSignature,
      accessTokenHash: sha256(accessToken),
      status: "sent",
      version: (latest?.version ?? 0) + 1,
      ...(tenantId ? { tenantId } : {})
    });

    await this.enquiryRepository.update(enquiryId, {
      proposalId: new Types.ObjectId(getEntityId(proposal)),
      selectedQuoteId: new Types.ObjectId(getEntityId(recommended)),
      status: "proposal_sent"
    });

    const pdfUrl = this.buildDocumentUrl(getEntityId(proposal), accessToken);
    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "proposal-message",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: copy.premiumMessage
        },
        idempotencyKey: `proposal-text:${getEntityId(proposal)}`,
        tenantId
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
        idempotencyKey: `proposal-doc:${getEntityId(proposal)}`,
        tenantId
      });
    }

    await customerFollowUpQueue.add(
      "proposal-review-follow-up",
      {
        tenantId,
        proposalId: getEntityId(proposal)
      },
      {
        delay: tenantConfig.automation.customerFollowUpMinutes * 60_000,
        jobId: `proposal-review-follow-up:${getEntityId(proposal)}`
      }
    );

    await recordUsageEvent("proposal.generated", 1, {
      enquiryId
    });

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
    const tenantId = getTenantIdFromEntity(proposal) || getTenantIdFromEntity(enquiry) || getTenantIdFromEntity(customer) || getCurrentTenantId();

    if (customer.phone) {
      await this.notificationService.enqueue({
        type: "proposal-review-reminder",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: "A gentle follow-up on your curated proposal. If you would like, I can walk you through the recommended option or refine the shortlist further before we proceed."
        },
        idempotencyKey: `proposal-review-reminder:${proposalId}`,
        tenantId
      });
    }
  }
}
