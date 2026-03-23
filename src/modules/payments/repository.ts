import { Payment, PaymentModel } from "./payment.model";
import { Types } from "mongoose";

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

  async findLatestByProposal(proposalId: string): Promise<Payment | null> {
    return PaymentModel.findOne({
      proposalId: new Types.ObjectId(proposalId)
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  async update(id: string, payload: Partial<Payment>): Promise<Payment | null> {
    const document = await PaymentModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }

  async claimForAutomation(id: string, lockTtlMs = 2 * 60_000): Promise<Payment | null> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + lockTtlMs);

    const document = await PaymentModel.findOneAndUpdate(
      {
        _id: id,
        status: { $ne: "captured" },
        $or: [
          { workflowLockExpiresAt: { $exists: false } },
          { workflowLockExpiresAt: null },
          { workflowLockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: {
          processingStartedAt: now,
          workflowLockExpiresAt: lockExpiresAt,
          lastWorkflowError: undefined
        }
      },
      { new: true }
    );

    return document?.toObject() ?? null;
  }

  async releaseAutomationLock(id: string, errorMessage?: string): Promise<void> {
    await PaymentModel.findByIdAndUpdate(id, {
      ...(errorMessage
        ? {
            $set: {
              lastWorkflowError: errorMessage
            }
          }
        : {}),
      $unset: {
        processingStartedAt: "",
        workflowLockExpiresAt: ""
      }
    });
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
      },
      $unset: {
        processingStartedAt: "",
        workflowLockExpiresAt: ""
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
