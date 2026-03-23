import { WebhookReceipt, WebhookReceiptModel } from "./webhook-receipt.model";

export class WebhookReceiptRepository {
  async tryStartProcessing(
    provider: WebhookReceipt["provider"],
    externalEventId: string,
    signature?: string,
    lockTtlMs = 5 * 60_000
  ): Promise<"acquired" | "duplicate" | "in_progress"> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockTtlMs);

    try {
      await WebhookReceiptModel.create({
        provider,
        externalEventId,
        signature,
        status: "processing",
        processingAttempts: 1,
        processingStartedAt: now,
        lockExpiresAt
      });

      return "acquired";
    } catch (error) {
      const duplicateKeyErrorCode = 11000;
      if ((error as { code?: number }).code !== duplicateKeyErrorCode) {
        throw error;
      }
    }

    const current = await WebhookReceiptModel.findOne({ provider, externalEventId }).lean();
    if (!current) {
      return "in_progress";
    }

    if (current.status === "completed") {
      return "duplicate";
    }

    if (current.status === "processing" && current.lockExpiresAt && current.lockExpiresAt > now) {
      return "in_progress";
    }

    const reclaimed = await WebhookReceiptModel.findOneAndUpdate(
      {
        provider,
        externalEventId,
        $or: [
          { status: "failed" },
          { status: "processing", lockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: {
          signature,
          status: "processing",
          processingStartedAt: now,
          lockExpiresAt,
          lastError: undefined
        },
        $inc: {
          processingAttempts: 1
        }
      },
      { new: true }
    );

    return reclaimed ? "acquired" : "in_progress";
  }

  async markCompleted(provider: WebhookReceipt["provider"], externalEventId: string, signature?: string): Promise<void> {
    await WebhookReceiptModel.updateOne(
      { provider, externalEventId },
      {
        $set: {
          signature,
          status: "completed",
          processedAt: new Date(),
          lastError: undefined
        },
        $unset: {
          lockExpiresAt: "",
          processingStartedAt: ""
        }
      }
    );
  }

  async markFailed(provider: WebhookReceipt["provider"], externalEventId: string, errorMessage: string, signature?: string): Promise<void> {
    await WebhookReceiptModel.updateOne(
      { provider, externalEventId },
      {
        $set: {
          signature,
          status: "failed",
          lastError: errorMessage
        },
        $unset: {
          lockExpiresAt: "",
          processingStartedAt: ""
        }
      }
    );
  }
}
