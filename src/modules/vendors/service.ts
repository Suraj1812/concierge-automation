import { Types } from "mongoose";
import { Enquiry } from "../enquiries/enquiry.model";
import { EnquiryRepository } from "../enquiries/repository";
import { Vendor, VendorContact } from "./vendor.model";
import { VendorRepository } from "./repository";
import { vendorOutreachQueue } from "../../infrastructure/queue/queues";
import { addMinutes } from "../../common/utils/date";
import { env } from "../../config/env";
import { getEntityId } from "../../common/utils/entity";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";
import { getTenantIdFromEntity } from "../../common/utils/tenant";

export class VendorService {
  constructor(
    private readonly vendorRepository: VendorRepository,
    private readonly enquiryRepository: EnquiryRepository
  ) {}

  private choosePrimaryChannel(vendor: Vendor): VendorContact["channel"] {
    return vendor.contactPoints.find((contact) => contact.channel === "whatsapp")?.channel
      || vendor.contactPoints.find((contact) => contact.channel === "email")?.channel
      || vendor.contactPoints[0]?.channel
      || "email";
  }

  private computeMatchScore(vendor: Vendor, enquiry: Enquiry): number {
    const geoScore = enquiry.requirements.destination && (vendor.geoCoverage.includes(enquiry.requirements.destination) || vendor.geoCoverage.includes("global")) ? 25 : 10;
    const capabilityScore = enquiry.requirements.preferences?.some((preference) => vendor.capabilities.includes(preference)) ? 20 : 10;
    const ratingScore = vendor.rating * 12;
    const priorityScore = vendor.priorityWeight * 8;
    return geoScore + capabilityScore + ratingScore + priorityScore;
  }

  async list(): Promise<Vendor[]> {
    return this.vendorRepository.list();
  }

  async create(payload: Vendor): Promise<Vendor> {
    return this.vendorRepository.create(payload);
  }

  async update(vendorId: string, payload: Partial<Vendor>): Promise<Vendor | null> {
    return this.vendorRepository.update(vendorId, payload);
  }

  async matchAndDispatch(enquiry: Enquiry): Promise<Vendor[]> {
    const tenantId = getTenantIdFromEntity(enquiry) || getCurrentTenantId();
    const matched = await this.vendorRepository.matchVendors(enquiry.serviceType, enquiry.requirements.destination);
    const ranked = matched
      .map((vendor) => ({
        vendor,
        score: this.computeMatchScore(vendor, enquiry)
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    await this.enquiryRepository.update(getEntityId(enquiry), {
      matchedVendorIds: ranked.map(({ vendor }) => new Types.ObjectId(getEntityId(vendor))),
      status: "awaiting_vendor_quotes"
    });

    for (const { vendor } of ranked) {
      const vendorRequest = await this.vendorRepository.createOrUpdateVendorRequest({
        enquiryId: getEntityId(enquiry),
        vendorId: getEntityId(vendor),
        communicationChannel: this.choosePrimaryChannel(vendor),
        responseDueAt: addMinutes(new Date(), env.VENDOR_RESPONSE_TIMEOUT_MINUTES)
      });

      await vendorOutreachQueue.add(
        "vendor-outreach",
        {
          tenantId,
          vendorRequestId: getEntityId(vendorRequest)
        },
        {
          jobId: `vendor-outreach:${getEntityId(enquiry)}:${getEntityId(vendor)}`
        }
      );
    }

    return ranked.map(({ vendor }) => vendor);
  }
}
