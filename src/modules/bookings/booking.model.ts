import { HydratedDocument, Schema, Types, model } from "mongoose";
import { bookingStatuses } from "../../common/types/domain";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface Booking {
  enquiryId: Types.ObjectId;
  customerId: Types.ObjectId;
  vendorId: Types.ObjectId;
  quoteId: Types.ObjectId;
  proposalId: Types.ObjectId;
  paymentId?: Types.ObjectId;
  status: (typeof bookingStatuses)[number];
  confirmationReference?: string;
  serviceWindow?: string;
  notes?: string;
}

const bookingSchema = new Schema<Booking>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true },
    quoteId: { type: Schema.Types.ObjectId, ref: "Quote", required: true },
    proposalId: { type: Schema.Types.ObjectId, ref: "Proposal", required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    status: { type: String, enum: bookingStatuses, default: "pending_payment", index: true },
    confirmationReference: { type: String },
    serviceWindow: { type: String },
    notes: { type: String }
  },
  {
    timestamps: true
  }
);

bookingSchema.plugin(tenantScopedPlugin);
bookingSchema.index({ tenantId: 1, enquiryId: 1 }, { unique: true });

export const BookingModel = model<Booking>("Booking", bookingSchema);
export type BookingDocument = HydratedDocument<Booking>;
