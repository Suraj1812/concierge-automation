import { Notification, NotificationModel } from "./notification.model";

export class NotificationRepository {
  async create(payload: Notification): Promise<Notification> {
    const document = await NotificationModel.create(payload);
    return document.toObject();
  }

  async findById(id: string): Promise<Notification | null> {
    return NotificationModel.findById(id).lean();
  }

  async markSent(id: string): Promise<void> {
    await NotificationModel.findByIdAndUpdate(id, {
      $set: {
        status: "sent",
        sentAt: new Date()
      }
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await NotificationModel.findByIdAndUpdate(id, {
      $inc: { attempts: 1 },
      $set: {
        status: "failed",
        lastError: errorMessage
      }
    });
  }
}
