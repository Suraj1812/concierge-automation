import { Payment, PaymentModel } from "./payment.model";

export class PaymentRepository {
  async create(payload: Payment): Promise<Payment> {
    const document = await PaymentModel.create(payload);
    return document.toObject();
  }

  async findById(id: string): Promise<Payment | null> {
    return PaymentModel.findById(id).lean();
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return PaymentModel.findOne({
      $or: [{ razorpayOrderId: orderId }, { "orderHistory.orderId": orderId }]
    }).lean();
  }

  async update(id: string, payload: Partial<Payment>): Promise<Payment | null> {
    const document = await PaymentModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }

  async incrementRetryWithNewOrder(
    id: string,
    payload: { orderId: string; receipt: string; expiresAt: Date }
  ): Promise<void> {
    await PaymentModel.findByIdAndUpdate(id, {
      $inc: { retryCount: 1 },
      $set: {
        razorpayOrderId: payload.orderId,
        receipt: payload.receipt,
        expiresAt: payload.expiresAt,
        status: "pending"
      },
      $push: {
        orderHistory: {
          orderId: payload.orderId,
          receipt: payload.receipt,
          createdAt: new Date(),
          status: "active"
        }
      }
    });
  }

  async markOrderStatus(id: string, orderId: string, status: "replaced" | "captured" | "failed"): Promise<void> {
    await PaymentModel.updateOne(
      { _id: id, "orderHistory.orderId": orderId },
      {
        $set: {
          "orderHistory.$.status": status
        }
      }
    );
  }

  async appendWebhookEvent(id: string, eventType: string, eventId: string | undefined, payload: Record<string, unknown>): Promise<void> {
    await PaymentModel.findByIdAndUpdate(id, {
      $push: {
        webhookEvents: {
          eventId,
          eventType,
          payload,
          receivedAt: new Date()
        }
      }
    });
  }
}
