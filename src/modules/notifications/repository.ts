import { Notification, NotificationModel } from "./notification.model";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class NotificationRepository {
  async create(payload: Notification): Promise<Notification> {
    const document = await NotificationModel.create(attachTenantPayload(payload));
    return document.toObject();
  }

  async findById(id: string): Promise<Notification | null> {
    return NotificationModel.findById(id).lean();
  }

  async claimForProcessing(id: string, lockTtlMs = 2 * 60_000): Promise<Notification | null> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockTtlMs);

    const document = await NotificationModel.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { status: "pending" },
          { status: "failed" },
          { status: "processing", lockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: {
          status: "processing",
          processingStartedAt: now,
          lockExpiresAt,
          lastError: undefined
        },
        $inc: {
          attempts: 1
        }
      },
      { new: true }
    );

    return document?.toObject() ?? null;
  }

  async markSent(id: string): Promise<void> {
    await NotificationModel.findByIdAndUpdate(id, {
      $set: {
        status: "sent",
        sentAt: new Date(),
        lastError: undefined
      },
      $unset: {
        processingStartedAt: "",
        lockExpiresAt: ""
      }
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await NotificationModel.findByIdAndUpdate(id, {
      $set: {
        status: "failed",
        lastError: errorMessage
      },
      $unset: {
        processingStartedAt: "",
        lockExpiresAt: ""
      }
    });
  }

  async markQueueingFailure(id: string, errorMessage: string): Promise<void> {
    await NotificationModel.findByIdAndUpdate(id, {
      $set: {
        status: "failed",
        lastError: errorMessage
      }
    });
  }
}
