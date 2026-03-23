import { Types } from "mongoose";
import { Enquiry, EnquiryModel } from "./enquiry.model";
import { EnquiryStatus } from "../../common/types/domain";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class EnquiryRepository {
  async create(payload: Enquiry): Promise<Enquiry> {
    const document = await EnquiryModel.create(attachTenantPayload(payload as unknown as Record<string, unknown>));
    return document.toObject();
  }

  async findById(id: string): Promise<Enquiry | null> {
    return EnquiryModel.findById(id).lean();
  }

  async list(): Promise<Enquiry[]> {
    return EnquiryModel.find().sort({ createdAt: -1 }).lean();
  }

  async findLatestActiveByCustomer(customerId: string): Promise<Enquiry | null> {
    return EnquiryModel.findOne({
      customerId: new Types.ObjectId(customerId),
      status: { $nin: ["completed", "cancelled"] }
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(id: string, payload: Partial<Enquiry>): Promise<Enquiry | null> {
    const document = await EnquiryModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }

  async updateStatus(id: string, status: EnquiryStatus): Promise<void> {
    await EnquiryModel.findByIdAndUpdate(id, { $set: { status } });
  }
}
