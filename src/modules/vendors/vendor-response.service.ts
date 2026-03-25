import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError";
import { VendorRepository } from "./repository";
import { QuoteService } from "../quotes/service";
import { Quote } from "../quotes/quote.model";

export class VendorResponseService {
  constructor(
    private readonly vendorRepository: VendorRepository,
    private readonly quoteService: QuoteService
  ) {}

  private extractVendorReference(rawPayload: string): string | null {
    const match = rawPayload.match(/\bVR-[A-Z0-9]{8}\b/);
    return match?.[0] ?? null;
  }

  async processReply(payload: {
    vendorReference?: string;
    vendorId?: string;
    enquiryId?: string;
    rawPayload: string;
    expiresAt?: string;
  }): Promise<Quote> {
    const resolvedReference = payload.vendorReference || this.extractVendorReference(payload.rawPayload);

    const vendorRequest = resolvedReference
      ? await this.vendorRepository.findVendorRequestByReference(resolvedReference)
      : payload.vendorId && payload.enquiryId
        ? await this.vendorRepository.findVendorRequestByEnquiryAndVendor(payload.enquiryId, payload.vendorId)
        : payload.vendorId
          ? await this.vendorRepository.findLatestOpenRequestByVendor(payload.vendorId)
          : null;

    if (!vendorRequest) {
      throw new AppError("Unable to map vendor reply to an active request", 422, "VENDOR_REPLY_NOT_MAPPED");
    }

    const quote: Quote = {
      enquiryId: new Types.ObjectId(vendorRequest.enquiryId.toString()),
      vendorId: new Types.ObjectId(vendorRequest.vendorId.toString()),
      rawPayload: payload.rawPayload,
      status: "received",
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined
    };

    return this.quoteService.create(quote);
  }
}
