import { Types } from "mongoose";
import { env } from "../../config/env";
import { AppError } from "../../common/errors/AppError";
import { bookingLifecycleQueue, paymentQueue } from "../../infrastructure/queue/queues";
import { PaymentRepository } from "./repository";
import { ProposalRepository } from "../proposals/repository";
import { EnquiryRepository } from "../enquiries/repository";
import { QuoteRepository } from "../quotes/repository";
import { RazorpayService } from "../integrations/razorpay.service";
import { WebhookReceiptRepository } from "../integrations/webhook-receipt.repository";
import { NotificationService } from "../notifications/service";
import { CustomerRepository } from "../users/repository";
import { getEntityId } from "../../common/utils/entity";
import { addMinutes } from "../../common/utils/date";

type RazorpayWebhookPayload = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
      };
    };
    order?: {
      entity?: {
        id?: string;
      };
    };
  };
};

export class PaymentService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly proposalRepository: ProposalRepository,
    private readonly enquiryRepository: EnquiryRepository,
    private readonly quoteRepository: QuoteRepository,
    private readonly customerRepository: CustomerRepository,
    private readonly razorpayService: RazorpayService,
    private readonly webhookReceiptRepository: WebhookReceiptRepository,
    private readonly notificationService: NotificationService
  ) {}

  async createOrder(enquiryId: string, proposalId: string) {
    const proposal = await this.proposalRepository.findById(proposalId);
    const enquiry = await this.enquiryRepository.findById(enquiryId);

    if (!proposal || !enquiry) {
      throw new AppError("Proposal or enquiry not found", 404, "PAYMENT_CONTEXT_NOT_FOUND");
    }

    const quote = await this.quoteRepository.findById(proposal.recommendedQuoteId.toString());
    const customer = await this.customerRepository.findById(enquiry.customerId.toString());

    if (!quote || !quote.normalizedOffer || !customer) {
      throw new AppError("Payment data incomplete", 422, "PAYMENT_DATA_INCOMPLETE");
    }

    const receipt = `enquiry_${enquiryId}_${Date.now()}`;
    const order = await this.razorpayService.createOrder({
      amount: Math.round(quote.normalizedOffer.totalAmount * 100),
      currency: quote.normalizedOffer.currency,
      receipt,
      notes: {
        enquiryId,
        proposalId
      }
    });

    const payment = await this.paymentRepository.create({
      enquiryId: new Types.ObjectId(enquiryId),
      proposalId: new Types.ObjectId(proposalId),
      amount: quote.normalizedOffer.totalAmount,
      currency: quote.normalizedOffer.currency,
      status: "pending",
      receipt,
      razorpayOrderId: order.id,
      retryCount: 0,
      expiresAt: addMinutes(new Date(), env.PAYMENT_LINK_EXPIRY_MINUTES),
      orderHistory: [
        {
          orderId: order.id,
          receipt,
          createdAt: new Date(),
          status: "active"
        }
      ],
      webhookEvents: []
    });

    await this.enquiryRepository.update(enquiryId, {
      paymentStatus: "pending",
      status: "payment_pending"
    });

    await paymentQueue.add(
      "payment-reminder",
      {
        paymentId: getEntityId(payment)
      },
      {
        delay: Math.floor(env.PAYMENT_LINK_EXPIRY_MINUTES / 2) * 60_000,
        jobId: `payment-reminder:${getEntityId(payment)}`
      }
    );

    await this.notificationService.enqueue({
      type: "payment-link",
      channel: "whatsapp",
      recipient: customer.phone,
      body: {
        text: `Your payment link is ready. Order reference: ${order.id}. Please proceed at your convenience, and I’ll continue coordinating everything in the background.`
      },
      idempotencyKey: `payment-link:${order.id}`
    });

    return {
      paymentId: getEntityId(payment),
      orderId: order.id,
      amount: quote.normalizedOffer.totalAmount,
      currency: quote.normalizedOffer.currency,
      keyId: env.RAZORPAY_KEY_ID
    };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined, payload: RazorpayWebhookPayload): Promise<void> {
    const isValid = this.razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new AppError("Invalid Razorpay webhook signature", 403, "INVALID_WEBHOOK_SIGNATURE");
    }

    const orderId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id;
    const eventId = payload.payload?.payment?.entity?.id || `${payload.event}:${orderId}`;

    if (!orderId || !eventId) {
      return;
    }

    if (await this.webhookReceiptRepository.hasProcessed("razorpay", eventId)) {
      return;
    }

    const payment = await this.paymentRepository.findByOrderId(orderId);
    if (!payment) {
      await this.webhookReceiptRepository.markProcessed("razorpay", eventId, signature);
      return;
    }

    await this.paymentRepository.appendWebhookEvent(getEntityId(payment), payload.event, eventId, payload as Record<string, unknown>);

    if (payload.event === "payment.captured") {
      await this.paymentRepository.update(getEntityId(payment), {
        status: "captured",
        razorpayPaymentId: payload.payload?.payment?.entity?.id,
        razorpaySignature: signature
      });
      await this.paymentRepository.markOrderStatus(getEntityId(payment), orderId, "captured");
      await this.enquiryRepository.update(payment.enquiryId.toString(), {
        paymentStatus: "captured",
        status: "payment_authorized"
      });

      await bookingLifecycleQueue.add(
        "payment-captured",
        {
          paymentId: getEntityId(payment)
        },
        {
          jobId: `payment-captured:${getEntityId(payment)}`
        }
      );
    }

    if (payload.event === "payment.failed") {
      await this.paymentRepository.update(getEntityId(payment), {
        status: "failed",
        razorpayPaymentId: payload.payload?.payment?.entity?.id,
        razorpaySignature: signature
      });
      await this.paymentRepository.markOrderStatus(getEntityId(payment), orderId, "failed");
      await paymentQueue.add(
        "payment-reminder",
        {
          paymentId: getEntityId(payment)
        },
        {
          delay: 15 * 60_000,
          jobId: `payment-failed-retry:${getEntityId(payment)}:${Date.now()}`
        }
      );
    }

    await this.webhookReceiptRepository.markProcessed("razorpay", eventId, signature);
  }

  async processReminder(paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.findById(paymentId);
    if (!payment || payment.status === "captured") {
      return;
    }

    const enquiry = await this.enquiryRepository.findById(payment.enquiryId.toString());
    if (!enquiry) {
      return;
    }

    const customer = await this.customerRepository.findById(enquiry.customerId.toString());
    if (!customer) {
      return;
    }

    const isExpired = payment.expiresAt ? payment.expiresAt <= new Date() : false;

    if ((payment.status === "failed" || isExpired) && payment.retryCount < env.MAX_PAYMENT_RETRY_ATTEMPTS) {
      const proposal = payment.proposalId ? await this.proposalRepository.findById(payment.proposalId.toString()) : null;
      const quote = proposal ? await this.quoteRepository.findById(proposal.recommendedQuoteId.toString()) : null;

      if (!proposal || !quote?.normalizedOffer) {
        return;
      }

      const newReceipt = `${payment.receipt}-r${payment.retryCount + 1}`;
      const newOrder = await this.razorpayService.createOrder({
        amount: Math.round(quote.normalizedOffer.totalAmount * 100),
        currency: quote.normalizedOffer.currency,
        receipt: newReceipt,
        notes: {
          enquiryId: payment.enquiryId.toString(),
          proposalId: getEntityId(proposal),
          paymentId
        }
      });

      if (payment.razorpayOrderId) {
        await this.paymentRepository.markOrderStatus(paymentId, payment.razorpayOrderId, "replaced");
      }

      await this.paymentRepository.incrementRetryWithNewOrder(paymentId, {
        orderId: newOrder.id,
        receipt: newReceipt,
        expiresAt: addMinutes(new Date(), env.PAYMENT_LINK_EXPIRY_MINUTES)
      });

      await this.notificationService.enqueue({
        type: "payment-retry-link",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: `I’ve refreshed your secure payment link for convenience. Your new order reference is ${newOrder.id}. Once completed, I’ll confirm everything immediately.`
        },
        idempotencyKey: `payment-retry-link:${paymentId}:${newOrder.id}`
      });

      await paymentQueue.add(
        "payment-reminder",
        { paymentId },
        {
          delay: Math.floor(env.PAYMENT_LINK_EXPIRY_MINUTES / 2) * 60_000,
          jobId: `payment-reminder:${paymentId}:${newOrder.id}`
        }
      );

      return;
    }

    if ((payment.status === "failed" || isExpired) && payment.retryCount >= env.MAX_PAYMENT_RETRY_ATTEMPTS) {
      await this.notificationService.enqueue({
        type: "payment-manual-assistance",
        channel: "whatsapp",
        recipient: customer.phone,
        body: {
          text: "Your payment link has expired a few times, so I recommend a quick manual check-in. Our team can assist immediately to complete the booking smoothly."
        },
        idempotencyKey: `payment-manual-assistance:${paymentId}`
      });
      return;
    }

    await this.notificationService.enqueue({
      type: "payment-reminder",
      channel: "whatsapp",
      recipient: customer.phone,
      body: {
        text: "A quick reminder that your secure payment link is still active. Once completed, I’ll confirm the booking and coordinate the next steps immediately."
      },
      idempotencyKey: `payment-reminder:${paymentId}:${Date.now()}`
    });

    if (payment.expiresAt) {
      const nextDelay = Math.max(15 * 60_000, Math.floor((payment.expiresAt.getTime() - Date.now()) / 2));
      await paymentQueue.add(
        "payment-reminder",
        { paymentId },
        {
          delay: nextDelay,
          jobId: `payment-reminder:${paymentId}:${Date.now()}`
        }
      );
    }
  }
}
