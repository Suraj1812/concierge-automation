import { HydratedDocument, Schema, model } from "mongoose";

export interface IdempotencyKeyRecord {
  key: string;
  route: string;
  method: string;
  requestHash: string;
  status: "in_progress" | "completed" | "failed";
  responseStatus?: number;
  responseBody?: Record<string, unknown>;
  processingStartedAt?: Date;
  lockExpiresAt?: Date;
  lastError?: string;
  expiresAt: Date;
}

const idempotencyKeySchema = new Schema<IdempotencyKeyRecord>(
  {
    key: { type: String, required: true, unique: true, index: true },
    route: { type: String, required: true },
    method: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: { type: String, enum: ["in_progress", "completed", "failed"], required: true, default: "in_progress", index: true },
    responseStatus: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    processingStartedAt: { type: Date },
    lockExpiresAt: { type: Date, index: true },
    lastError: { type: String },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  {
    timestamps: true
  }
);

export const IdempotencyKeyModel = model<IdempotencyKeyRecord>("IdempotencyKey", idempotencyKeySchema);
export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKeyRecord>;
