import { Types } from "mongoose";
import { Quote, QuoteModel } from "./quote.model";

export class QuoteRepository {
  async create(payload: Quote): Promise<Quote> {
    const document = await QuoteModel.create(payload);
    return document.toObject();
  }

  async findById(id: string): Promise<Quote | null> {
    return QuoteModel.findById(id).lean();
  }

  async findByEnquiry(enquiryId: string): Promise<Quote[]> {
    return QuoteModel.find({ enquiryId: new Types.ObjectId(enquiryId) }).sort({ createdAt: -1 }).lean();
  }

  async update(id: string, payload: Partial<Quote>): Promise<Quote | null> {
    const document = await QuoteModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }
}
