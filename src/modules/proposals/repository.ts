import { Types } from "mongoose";
import { Proposal, ProposalModel } from "./proposal.model";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class ProposalRepository {
  async create(payload: Proposal): Promise<Proposal> {
    const document = await ProposalModel.create(attachTenantPayload(payload));
    return document.toObject();
  }

  async findById(id: string): Promise<Proposal | null> {
    return ProposalModel.findById(id).lean();
  }

  async findLatestByEnquiry(enquiryId: string): Promise<Proposal | null> {
    return ProposalModel.findOne({ enquiryId: new Types.ObjectId(enquiryId) }).sort({ version: -1 }).lean();
  }

  async findByAccessTokenHash(proposalId: string, accessTokenHash: string): Promise<Proposal | null> {
    return ProposalModel.findOne({
      _id: new Types.ObjectId(proposalId),
      accessTokenHash
    }).lean();
  }

  async updateStatus(id: string, status: Proposal["status"]): Promise<void> {
    await ProposalModel.findByIdAndUpdate(id, { $set: { status } });
  }
}
