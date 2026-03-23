import { HydratedDocument, Schema, Types, model } from "mongoose";
import { enquiryStatuses, serviceTypes, type EnquiryStatus, type ServiceType } from "../../common/types/domain";

export interface EnquiryRequirements {
  destination?: string;
  startDate?: string;
  endDate?: string;
  guestCount?: number;
  budgetMin?: number;
  budgetMax?: number;
  preferences?: string[];
  notes?: string;
}

export interface Enquiry {
  customerId: Types.ObjectId;
  source: "whatsapp";
  serviceType: ServiceType;
  status: EnquiryStatus;
  title: string;
  summary: string;
  requirements: EnquiryRequirements;
  missingFields: string[];
  extractedData: Record<string, unknown>;
  matchedVendorIds: Types.ObjectId[];
  selectedQuoteId?: Types.ObjectId;
  proposalId?: Types.ObjectId;
  bookingId?: Types.ObjectId;
  paymentStatus?: string;
  priorityScore: number;
  slaDueAt?: Date;
}

const enquirySchema = new Schema<Enquiry>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    source: { type: String, enum: ["whatsapp"], default: "whatsapp" },
    serviceType: { type: String, enum: serviceTypes, required: true, index: true },
    status: { type: String, enum: enquiryStatuses, default: "new", index: true },
    title: { type: String, required: true },
    summary: { type: String, required: true },
    requirements: {
      destination: { type: String },
      startDate: { type: String },
      endDate: { type: String },
      guestCount: { type: Number },
      budgetMin: { type: Number },
      budgetMax: { type: Number },
      preferences: [{ type: String }],
      notes: { type: String }
    },
    missingFields: [{ type: String }],
    extractedData: { type: Schema.Types.Mixed, default: {} },
    matchedVendorIds: [{ type: Schema.Types.ObjectId, ref: "Vendor" }],
    selectedQuoteId: { type: Schema.Types.ObjectId, ref: "Quote" },
    proposalId: { type: Schema.Types.ObjectId, ref: "Proposal" },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    paymentStatus: { type: String },
    priorityScore: { type: Number, default: 0 },
    slaDueAt: { type: Date }
  },
  {
    timestamps: true
  }
);

enquirySchema.index({ customerId: 1, createdAt: -1 });

export const EnquiryModel = model<Enquiry>("Enquiry", enquirySchema);
export type EnquiryDocument = HydratedDocument<Enquiry>;
