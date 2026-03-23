import { Types } from "mongoose";
import { Vendor, VendorModel } from "./vendor.model";
import { VendorRequest, VendorRequestModel } from "./vendor-request.model";
import { ServiceType, VendorRequestStatus } from "../../common/types/domain";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class VendorRepository {
  async list(): Promise<Vendor[]> {
    return VendorModel.find().sort({ createdAt: -1 }).lean();
  }

  async findById(id: string): Promise<Vendor | null> {
    return VendorModel.findById(id).lean();
  }

  async create(payload: Vendor): Promise<Vendor> {
    const document = await VendorModel.create(attachTenantPayload(payload as unknown as Record<string, unknown>));
    return document.toObject();
  }

  async update(id: string, payload: Partial<Vendor>): Promise<Vendor | null> {
    const document = await VendorModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }

  async matchVendors(serviceType: ServiceType, destination?: string): Promise<Vendor[]> {
    const filters: Record<string, unknown> = {
      supportedServices: serviceType,
      isActive: true
    };

    if (destination) {
      filters.$or = [{ geoCoverage: destination }, { geoCoverage: "global" }];
    }

    return VendorModel.find(filters).sort({ rating: -1, priorityWeight: -1 }).limit(10).lean();
  }

  async createOrUpdateVendorRequest(payload: {
    enquiryId: string;
    vendorId: string;
    communicationChannel: VendorRequest["communicationChannel"];
    responseDueAt?: Date;
  }): Promise<VendorRequest> {
    const document = await VendorRequestModel.findOneAndUpdate(
      {
        enquiryId: new Types.ObjectId(payload.enquiryId),
        vendorId: new Types.ObjectId(payload.vendorId)
      },
      {
        $set: {
          communicationChannel: payload.communicationChannel,
          responseDueAt: payload.responseDueAt
        },
        $setOnInsert: {
          status: "queued",
          attemptCount: 0
        }
      },
      { new: true, upsert: true }
    );

    if (!document.vendorReference) {
      document.vendorReference = `VR-${document.id.slice(-8).toUpperCase()}`;
      await document.save();
    }

    return document.toObject();
  }

  async updateVendorRequestStatus(id: string, status: VendorRequestStatus, patch?: Partial<VendorRequest>): Promise<void> {
    await VendorRequestModel.findByIdAndUpdate(id, {
      $set: {
        status,
        ...patch
      }
    });
  }

  async claimVendorRequestForDispatch(id: string, lockTtlMs = 2 * 60_000): Promise<VendorRequest | null> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockTtlMs);

    const document = await VendorRequestModel.findOneAndUpdate(
      {
        _id: id,
        status: { $in: ["queued", "sent"] },
        $or: [
          { dispatchLockExpiresAt: { $exists: false } },
          { dispatchLockExpiresAt: null },
          { dispatchLockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: {
          dispatchStartedAt: now,
          dispatchLockExpiresAt: lockExpiresAt,
          lastDispatchError: undefined
        }
      },
      { new: true }
    );

    return document?.toObject() ?? null;
  }

  async completeVendorRequestDispatch(id: string, nextDueAt?: Date): Promise<void> {
    await VendorRequestModel.findByIdAndUpdate(id, {
      $inc: { attemptCount: 1 },
      $set: {
        status: "sent",
        lastSentAt: new Date(),
        ...(nextDueAt ? { responseDueAt: nextDueAt } : {}),
        lastDispatchError: undefined
      },
      $unset: {
        dispatchStartedAt: "",
        dispatchLockExpiresAt: ""
      }
    });
  }

  async releaseVendorRequestDispatch(id: string, errorMessage: string): Promise<void> {
    await VendorRequestModel.findByIdAndUpdate(id, {
      $set: {
        lastDispatchError: errorMessage
      },
      $unset: {
        dispatchStartedAt: "",
        dispatchLockExpiresAt: ""
      }
    });
  }

  async findOpenVendorRequestsByEnquiry(enquiryId: string): Promise<VendorRequest[]> {
    return VendorRequestModel.find({
      enquiryId: new Types.ObjectId(enquiryId),
      status: { $in: ["queued", "sent"] }
    }).lean();
  }

  async findVendorRequestById(id: string): Promise<VendorRequest | null> {
    return VendorRequestModel.findById(id).lean();
  }

  async findVendorRequestByReference(vendorReference: string): Promise<VendorRequest | null> {
    return VendorRequestModel.findOne({ vendorReference }).lean();
  }

  async findVendorRequestByEnquiryAndVendor(enquiryId: string, vendorId: string): Promise<VendorRequest | null> {
    return VendorRequestModel.findOne({
      enquiryId: new Types.ObjectId(enquiryId),
      vendorId: new Types.ObjectId(vendorId)
    }).lean();
  }

  async findLatestOpenRequestByVendor(vendorId: string): Promise<VendorRequest | null> {
    return VendorRequestModel.findOne({
      vendorId: new Types.ObjectId(vendorId),
      status: { $in: ["queued", "sent"] }
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  async markVendorResponded(enquiryId: string, vendorId: string, latestMessage: string): Promise<void> {
    await VendorRequestModel.findOneAndUpdate(
      {
        enquiryId: new Types.ObjectId(enquiryId),
        vendorId: new Types.ObjectId(vendorId)
      },
      {
        $set: {
          status: "responded",
          lastResponseAt: new Date(),
          latestMessage
        },
        $unset: {
          dispatchStartedAt: "",
          dispatchLockExpiresAt: ""
        }
      }
    );
  }
}
