import { Types } from "mongoose";
import { Enquiry } from "./enquiry.model";
import { EnquiryRepository } from "./repository";
import { addMinutes } from "../../common/utils/date";
import { getEntityId } from "../../common/utils/entity";

type AiTurnPayload = {
  title: string;
  summary: string;
  serviceType?: Enquiry["serviceType"];
  extractedRequirements: Enquiry["requirements"];
  missingFields: string[];
};

type EnquiryUpdateResult = {
  enquiry: Enquiry;
  createdNewEnquiry: boolean;
  materialChangeDetected: boolean;
};

export class EnquiryService {
  constructor(private readonly enquiryRepository: EnquiryRepository) {}

  private calculatePriorityScore(requirements: Enquiry["requirements"]): number {
    const guestScore = Math.min((requirements.guestCount ?? 1) * 5, 30);
    const budgetScore = Math.min(Math.floor((requirements.budgetMax ?? 0) / 25_000), 40);
    const preferenceScore = Math.min((requirements.preferences?.length ?? 0) * 5, 20);
    return guestScore + budgetScore + preferenceScore + 10;
  }

  private mergeRequirements(existing: Enquiry["requirements"] | undefined, incoming: Enquiry["requirements"]): Enquiry["requirements"] {
    const preferences = Array.from(new Set([...(existing?.preferences ?? []), ...(incoming.preferences ?? [])]));

    return {
      ...existing,
      ...incoming,
      preferences
    };
  }

  private hasMaterialChange(existingEnquiry: Enquiry, aiTurn: AiTurnPayload): boolean {
    const incomingRequirements = aiTurn.extractedRequirements;
    const existingRequirements = existingEnquiry.requirements;
    const preferenceSignature = (value?: string[]) => [...(value ?? [])].sort().join("|");

    return (
      (aiTurn.serviceType && aiTurn.serviceType !== existingEnquiry.serviceType)
      || existingRequirements.destination !== incomingRequirements.destination
      || existingRequirements.startDate !== incomingRequirements.startDate
      || existingRequirements.endDate !== incomingRequirements.endDate
      || existingRequirements.guestCount !== incomingRequirements.guestCount
      || existingRequirements.budgetMin !== incomingRequirements.budgetMin
      || existingRequirements.budgetMax !== incomingRequirements.budgetMax
      || preferenceSignature(existingRequirements.preferences) !== preferenceSignature(incomingRequirements.preferences)
    );
  }

  async createOrUpdateFromAi(customerId: string, existingEnquiry: Enquiry | null, aiTurn: AiTurnPayload): Promise<EnquiryUpdateResult> {
    const materialChangeDetected = existingEnquiry ? this.hasMaterialChange(existingEnquiry, aiTurn) : false;
    const requirements = this.mergeRequirements(existingEnquiry?.requirements, aiTurn.extractedRequirements);
    const status: Enquiry["status"] = aiTurn.missingFields.length > 0 ? "awaiting_clarification" : "vendor_matching";
    const basePayload = {
      customerId: new Types.ObjectId(customerId),
      source: "whatsapp" as const,
      serviceType: aiTurn.serviceType ?? existingEnquiry?.serviceType ?? "bespoke",
      status,
      title: aiTurn.title,
      summary: aiTurn.summary,
      requirements,
      missingFields: aiTurn.missingFields,
      extractedData: {
        aiTurn
      },
      priorityScore: this.calculatePriorityScore(requirements),
      slaDueAt: addMinutes(new Date(), 30)
    };

    const shouldForkEnquiry = existingEnquiry
      && materialChangeDetected
      && ["awaiting_vendor_quotes", "quote_normalizing", "proposal_sent", "payment_pending", "payment_authorized", "booked"].includes(existingEnquiry.status);

    if (shouldForkEnquiry) {
      await this.enquiryRepository.updateStatus(getEntityId(existingEnquiry), "stalled");
      const enquiry = await this.enquiryRepository.create({
        ...basePayload,
        matchedVendorIds: []
      } as Enquiry);

      return {
        enquiry,
        createdNewEnquiry: true,
        materialChangeDetected: true
      };
    }

    if (existingEnquiry) {
      const updated = await this.enquiryRepository.update(getEntityId(existingEnquiry), basePayload);
      if (!updated) {
        throw new Error("Failed to update enquiry");
      }
      return {
        enquiry: updated,
        createdNewEnquiry: false,
        materialChangeDetected
      };
    }

    const enquiry = await this.enquiryRepository.create({
      ...basePayload,
      matchedVendorIds: []
    } as Enquiry);

    return {
      enquiry,
      createdNewEnquiry: true,
      materialChangeDetected: false
    };
  }

  async markMatched(enquiryId: string, vendorIds: string[]): Promise<void> {
    await this.enquiryRepository.update(enquiryId, {
      matchedVendorIds: vendorIds.map((id) => new Types.ObjectId(id)),
      status: "awaiting_vendor_quotes"
    });
  }

  async attachProposal(enquiryId: string, proposalId: string, selectedQuoteId: string): Promise<void> {
    await this.enquiryRepository.update(enquiryId, {
      proposalId: new Types.ObjectId(proposalId),
      selectedQuoteId: new Types.ObjectId(selectedQuoteId),
      status: "proposal_sent"
    });
  }

  async attachBooking(enquiryId: string, bookingId: string, paymentStatus: string): Promise<void> {
    await this.enquiryRepository.update(enquiryId, {
      bookingId: new Types.ObjectId(bookingId),
      paymentStatus,
      status: "booked"
    });
  }

  async updateStatus(enquiryId: string, status: Enquiry["status"]): Promise<void> {
    await this.enquiryRepository.updateStatus(enquiryId, status);
  }

  async getById(enquiryId: string): Promise<Enquiry | null> {
    return this.enquiryRepository.findById(enquiryId);
  }

  async list(): Promise<Enquiry[]> {
    return this.enquiryRepository.list();
  }

  async getLatestActiveByCustomer(customerId: string): Promise<Enquiry | null> {
    return this.enquiryRepository.findLatestActiveByCustomer(customerId);
  }
}
