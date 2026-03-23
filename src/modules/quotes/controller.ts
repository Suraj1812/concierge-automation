import { Request, Response } from "express";
import { Types } from "mongoose";
import { QuoteService } from "./service";
import { Quote } from "./quote.model";

export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const { enquiryId, vendorId, rawPayload, expiresAt } = request.body;
    const data = await this.quoteService.create({
      enquiryId: new Types.ObjectId(enquiryId),
      vendorId: new Types.ObjectId(vendorId),
      rawPayload,
      status: "received",
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    } as Quote);
    response.status(201).json({ success: true, data });
  };

  listByEnquiry = async (request: Request, response: Response): Promise<void> => {
    const data = await this.quoteService.listByEnquiry(request.query.enquiryId as string);
    response.status(200).json({ success: true, data });
  };
}
