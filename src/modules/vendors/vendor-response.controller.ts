import { Request, Response } from "express";
import { env } from "../../config/env";
import { createHmacSha256, safeEqual, sha256 } from "../../common/utils/crypto";
import { AppError } from "../../common/errors/AppError";
import { WebhookReceiptRepository } from "../integrations/webhook-receipt.repository";
import { VendorResponseService } from "./vendor-response.service";

export class VendorResponseController {
  constructor(
    private readonly vendorResponseService: VendorResponseService,
    private readonly webhookReceiptRepository: WebhookReceiptRepository
  ) {}

  private verifySignature(rawBody: Buffer | undefined, signatureHeader?: string): boolean {
    if (!rawBody || !signatureHeader) {
      return false;
    }

    const incoming = signatureHeader.replace("sha256=", "");
    const expected = createHmacSha256(env.VENDOR_WEBHOOK_SECRET, rawBody);
    return safeEqual(incoming, expected);
  }

  receiveWebhook = async (request: Request, response: Response): Promise<void> => {
    const isValid = this.verifySignature(request.rawBody, request.headers["x-vendor-signature"] as string | undefined);
    if (!isValid) {
      throw new AppError("Invalid vendor webhook signature", 403, "INVALID_VENDOR_SIGNATURE");
    }

    const eventId = (request.body.externalEventId as string | undefined) || sha256(JSON.stringify(request.body));

    const receiptState = await this.webhookReceiptRepository.tryStartProcessing(
      "vendor",
      eventId,
      request.headers["x-vendor-signature"] as string | undefined
    );

    if (receiptState !== "acquired") {
      response.status(200).json({ success: true, duplicate: true });
      return;
    }

    try {
      const data = await this.vendorResponseService.processReply({
        vendorReference: request.body.vendorReference,
        vendorId: request.body.vendorId,
        enquiryId: request.body.enquiryId,
        rawPayload: request.body.rawPayload,
        expiresAt: request.body.expiresAt
      });

      await this.webhookReceiptRepository.markCompleted(
        "vendor",
        eventId,
        request.headers["x-vendor-signature"] as string | undefined
      );

      response.status(202).json({ success: true, data });
    } catch (error) {
      await this.webhookReceiptRepository.markFailed(
        "vendor",
        eventId,
        (error as Error).message,
        request.headers["x-vendor-signature"] as string | undefined
      );
      throw error;
    }
  };
}
