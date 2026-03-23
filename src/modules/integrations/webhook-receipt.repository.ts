import { WebhookReceipt, WebhookReceiptModel } from "./webhook-receipt.model";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";

export class WebhookReceiptRepository {
  private buildScopedFilter(provider: WebhookReceipt["provider"], externalEventId: string): Record<string, unknown> {
    const tenantId = getCurrentTenantId();
    return tenantId ? { tenantId, provider, externalEventId } : { provider, externalEventId };
  }

  async tryStartProcessing(
    provider: WebhookReceipt["provider"],
    externalEventId: string,
    signature?: string,
    lockTtlMs = 5 * 60_000
  ): Promise<"acquired" | "duplicate" | "in_progress"> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockTtlMs);
    const tenantId = getCurrentTenantId();
    const existing = await WebhookReceiptModel.findOne(this.buildScopedFilter(provider, externalEventId)).lean();

    if (existing) {
      if (existing.status === "completed") {
        return "duplicate";
      }

      if (existing.status === "processing" && existing.lockExpiresAt && existing.lockExpiresAt > now) {
        return "in_progress";
      }
    }

    try {
      await WebhookReceiptModel.create({
        ...(tenantId ? { tenantId } : {}),
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

    const current = await WebhookReceiptModel.findOne(this.buildScopedFilter(provider, externalEventId)).lean();
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
        ...this.buildScopedFilter(provider, externalEventId),
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
      this.buildScopedFilter(provider, externalEventId),
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
      this.buildScopedFilter(provider, externalEventId),
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
