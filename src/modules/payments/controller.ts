import { Request, Response } from "express";
import { PaymentService } from "./service";

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  createOrder = async (request: Request, response: Response): Promise<void> => {
    const data = await this.paymentService.createOrder(request.body.enquiryId, request.body.proposalId);
    response.status(201).json({ success: true, data });
  };

  handleWebhook = async (request: Request, response: Response): Promise<void> => {
    await this.paymentService.handleWebhook(request.rawBody, request.headers["x-razorpay-signature"] as string | undefined, request.body);
    response.status(200).json({ success: true });
  };
}
