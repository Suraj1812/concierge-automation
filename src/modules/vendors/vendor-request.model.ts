import { HydratedDocument, Schema, Types, model } from "mongoose";
import { communicationChannels, vendorRequestStatuses } from "../../common/types/domain";

export interface VendorRequest {
  enquiryId: Types.ObjectId;
  vendorId: Types.ObjectId;
  status: (typeof vendorRequestStatuses)[number];
  communicationChannel: (typeof communicationChannels)[number];
  lastSentAt?: Date;
  lastResponseAt?: Date;
  attemptCount: number;
  responseDueAt?: Date;
  vendorReference?: string;
  latestMessage?: string;
  dispatchStartedAt?: Date;
  dispatchLockExpiresAt?: Date;
  lastDispatchError?: string;
}

const vendorRequestSchema = new Schema<VendorRequest>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    status: { type: String, enum: vendorRequestStatuses, default: "queued", index: true },
    communicationChannel: { type: String, enum: communicationChannels, required: true },
    lastSentAt: { type: Date },
    lastResponseAt: { type: Date },
    attemptCount: { type: Number, default: 0 },
    responseDueAt: { type: Date },
    vendorReference: { type: String },
    latestMessage: { type: String },
    dispatchStartedAt: { type: Date },
    dispatchLockExpiresAt: { type: Date, index: true },
    lastDispatchError: { type: String }
  },
  {
    timestamps: true
  }
);

vendorRequestSchema.index({ enquiryId: 1, vendorId: 1 }, { unique: true });
vendorRequestSchema.index({ vendorReference: 1 }, { unique: true, sparse: true });

export const VendorRequestModel = model<VendorRequest>("VendorRequest", vendorRequestSchema);
export type VendorRequestDocument = HydratedDocument<VendorRequest>;
