import { HydratedDocument, Schema, model } from "mongoose";

export interface IdempotencyKeyRecord {
  key: string;
  route: string;
  method: string;
  requestHash: string;
  responseStatus: number;
  responseBody: Record<string, unknown>;
  expiresAt: Date;
}

const idempotencyKeySchema = new Schema<IdempotencyKeyRecord>(
  {
    key: { type: String, required: true, unique: true, index: true },
    route: { type: String, required: true },
    method: { type: String, required: true },
    requestHash: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
  },
  {
    timestamps: true
  }
);

export const IdempotencyKeyModel = model<IdempotencyKeyRecord>("IdempotencyKey", idempotencyKeySchema);
export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKeyRecord>;
