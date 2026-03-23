import { Booking, BookingModel } from "./booking.model";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class BookingRepository {
  async create(payload: Booking): Promise<Booking> {
    const document = await BookingModel.create(attachTenantPayload(payload as unknown as Record<string, unknown>));
    return document.toObject();
  }

  async findById(id: string): Promise<Booking | null> {
    return BookingModel.findById(id).lean();
  }

  async list(): Promise<Booking[]> {
    return BookingModel.find().sort({ createdAt: -1 }).lean();
  }

  async findByEnquiry(enquiryId: string): Promise<Booking | null> {
    return BookingModel.findOne({ enquiryId }).lean();
  }

  async update(id: string, payload: Partial<Booking>): Promise<Booking | null> {
    const document = await BookingModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }
}
