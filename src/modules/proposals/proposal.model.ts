import { HydratedDocument, Schema, Types, model } from "mongoose";
import { proposalStatuses } from "../../common/types/domain";

export interface ProposalOption {
  quoteId: Types.ObjectId;
  title: string;
  totalAmount: number;
  currency: string;
  highlights: string[];
}

export interface Proposal {
  enquiryId: Types.ObjectId;
  customerId: Types.ObjectId;
  quoteIds: Types.ObjectId[];
  recommendedQuoteId: Types.ObjectId;
  summary: string;
  premiumMessage: string;
  pdfPath: string;
  quoteSignature: string;
  accessTokenHash: string;
  status: (typeof proposalStatuses)[number];
  version: number;
}

const proposalSchema = new Schema<Proposal>(
  {
    enquiryId: { type: Schema.Types.ObjectId, ref: "Enquiry", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    quoteIds: [{ type: Schema.Types.ObjectId, ref: "Quote", required: true }],
    recommendedQuoteId: { type: Schema.Types.ObjectId, ref: "Quote", required: true },
    summary: { type: String, required: true },
    premiumMessage: { type: String, required: true },
    pdfPath: { type: String, required: true },
    quoteSignature: { type: String, required: true, index: true },
    accessTokenHash: { type: String, required: true },
    status: { type: String, enum: proposalStatuses, default: "generated" },
    version: { type: Number, default: 1 }
  },
  {
    timestamps: true
  }
);

proposalSchema.index({ enquiryId: 1, version: -1 });

export const ProposalModel = model<Proposal>("Proposal", proposalSchema);
export type ProposalDocument = HydratedDocument<Proposal>;
