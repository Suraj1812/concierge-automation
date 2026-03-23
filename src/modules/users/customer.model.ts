import { HydratedDocument, Schema, model } from "mongoose";

export interface CustomerPreferences {
  language?: string;
  tone?: string;
  budgetRange?: string;
  destinations?: string[];
  dietaryRestrictions?: string[];
  roomPreferences?: string[];
  travelPreferences?: string[];
  specialOccasions?: string[];
}

export interface CustomerMemoryEvent {
  summary: string;
  createdAt: Date;
  source: "ai" | "ops" | "system";
}

export interface Customer {
  name?: string;
  phone: string;
  whatsappUserId?: string;
  email?: string;
  preferences: CustomerPreferences;
  memorySummary?: string;
  memoryEvents: CustomerMemoryEvent[];
  tags: string[];
  lastSeenAt?: Date;
}

const customerSchema = new Schema<Customer>(
  {
    name: { type: String, trim: true },
    phone: { type: String, required: true, unique: true, index: true },
    whatsappUserId: { type: String, index: true },
    email: { type: String, lowercase: true, trim: true },
    preferences: {
      language: { type: String, default: "en" },
      tone: { type: String, default: "premium" },
      budgetRange: { type: String },
      destinations: [{ type: String }],
      dietaryRestrictions: [{ type: String }],
      roomPreferences: [{ type: String }],
      travelPreferences: [{ type: String }],
      specialOccasions: [{ type: String }]
    },
    memorySummary: { type: String },
    memoryEvents: [
      {
        summary: { type: String, required: true },
        createdAt: { type: Date, required: true },
        source: { type: String, enum: ["ai", "ops", "system"], required: true }
      }
    ],
    tags: [{ type: String }],
    lastSeenAt: { type: Date }
  },
  {
    timestamps: true
  }
);

export const CustomerModel = model<Customer>("Customer", customerSchema);
export type CustomerDocument = HydratedDocument<Customer>;
