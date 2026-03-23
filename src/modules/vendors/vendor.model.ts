import { HydratedDocument, Schema, model } from "mongoose";
import { communicationChannels, serviceTypes, type CommunicationChannel } from "../../common/types/domain";
import { tenantScopedPlugin } from "../../infrastructure/tenancy/tenant-scoped.plugin";

export interface VendorContact {
  channel: CommunicationChannel;
  value: string;
  label?: string;
}

export interface Vendor {
  name: string;
  categories: string[];
  supportedServices: (typeof serviceTypes)[number][];
  geoCoverage: string[];
  capabilities: string[];
  contactPoints: VendorContact[];
  rating: number;
  responseSlaHours: number;
  priorityWeight: number;
  isActive: boolean;
}

const vendorSchema = new Schema<Vendor>(
  {
    name: { type: String, required: true, trim: true, index: true },
    categories: [{ type: String }],
    supportedServices: [{ type: String, enum: serviceTypes, required: true }],
    geoCoverage: [{ type: String }],
    capabilities: [{ type: String }],
    contactPoints: [
      {
        channel: { type: String, enum: communicationChannels, required: true },
        value: { type: String, required: true },
        label: { type: String }
      }
    ],
    rating: { type: Number, min: 0, max: 5, default: 4 },
    responseSlaHours: { type: Number, default: 4 },
    priorityWeight: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true }
  },
  {
    timestamps: true
  }
);

vendorSchema.index({ supportedServices: 1, isActive: 1 });
vendorSchema.index({ geoCoverage: 1, isActive: 1 });
vendorSchema.plugin(tenantScopedPlugin);

export const VendorModel = model<Vendor>("Vendor", vendorSchema);
export type VendorDocument = HydratedDocument<Vendor>;
