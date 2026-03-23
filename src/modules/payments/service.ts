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
import { recordUsageEvent } from "../usage/recorder";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";
import { resolveCurrentTenantConfig } from "../tenants/runtime-config";
import { getTenantIdFromEntity } from "../../common/utils/tenant";

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
    const tenantId = getTenantIdFromEntity(proposal)
      || getTenantIdFromEntity(enquiry)
      || getTenantIdFromEntity(customer)
      || getCurrentTenantId();

    if (!quote || !quote.normalizedOffer || !customer) {
      throw new AppError("Payment data incomplete", 422, "PAYMENT_DATA_INCOMPLETE");
    }
    if (!customer.phone) {
      throw new AppError("Customer phone number missing for WhatsApp payment flow", 422, "CUSTOMER_PHONE_MISSING");
    }

    const existingPayment = await this.paymentRepository.findLatestByProposal(proposalId);
    if (existingPayment?.status === "captured") {
      throw new AppError("Payment has already been captured for this proposal", 409, "PAYMENT_ALREADY_CAPTURED");
    }

    const activeExistingPayment = existingPayment
      && existingPayment.status === "pending"
      && existingPayment.razorpayOrderId
      && (!existingPayment.expiresAt || existingPayment.expiresAt > new Date());

    const tenantConfig = await resolveCurrentTenantConfig();

    if (activeExistingPayment) {
      return {
        paymentId: getEntityId(existingPayment),
        orderId: existingPayment.razorpayOrderId,
        amount: existingPayment.amount,
        currency: existingPayment.currency,
        keyId: tenantConfig.integrations.razorpay.keyId
      };
    }
    const serviceFee = Math.max(
      quote.normalizedOffer.totalAmount * (tenantConfig.pricing.serviceFeePercentage / 100),
      tenantConfig.pricing.minimumServiceFee
    );
    const payableAmount = quote.normalizedOffer.totalAmount + serviceFee;

    const receipt = `enquiry_${enquiryId}_${Date.now()}`;
    const order = await this.razorpayService.createOrder({
      amount: Math.round(payableAmount * 100),
      currency: quote.normalizedOffer.currency,
      receipt,
      notes: {
        enquiryId,
        proposalId,
        baseAmount: String(quote.normalizedOffer.totalAmount),
        serviceFee: String(serviceFee)
      }
    });

    const payment = await this.paymentRepository.create({
      enquiryId: new Types.ObjectId(enquiryId),
      proposalId: new Types.ObjectId(proposalId),
      amount: payableAmount,
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
      ,
      ...(tenantId ? { tenantId } : {})
    });

    await this.enquiryRepository.update(enquiryId, {
      paymentStatus: "pending",
      status: "payment_pending"
    });

    await paymentQueue.add(
      "payment-reminder",
      {
        tenantId,
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
      idempotencyKey: `payment-link:${order.id}`,
      tenantId
    });

    return {
      paymentId: getEntityId(payment),
      orderId: order.id,
      amount: payableAmount,
      currency: quote.normalizedOffer.currency,
      keyId: tenantConfig.integrations.razorpay.keyId
    };
  }

  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined, payload: RazorpayWebhookPayload): Promise<void> {
    const isValid = await this.razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw new AppError("Invalid Razorpay webhook signature", 403, "INVALID_WEBHOOK_SIGNATURE");
    }

    const orderId = payload.payload?.payment?.entity?.order_id || payload.payload?.order?.entity?.id;
    const eventId = payload.payload?.payment?.entity?.id || `${payload.event}:${orderId}`;

    if (!orderId || !eventId) {
      return;
    }

    const receiptState = await this.webhookReceiptRepository.tryStartProcessing("razorpay", eventId, signature);
    if (receiptState !== "acquired") {
      return;
    }

    try {
      const payment = await this.paymentRepository.findByOrderId(orderId);
      if (!payment) {
        await this.webhookReceiptRepository.markCompleted("razorpay", eventId, signature);
        return;
      }

      await this.paymentRepository.appendWebhookEvent(getEntityId(payment), payload.event, eventId, payload as Record<string, unknown>);
      const tenantId = getTenantIdFromEntity(payment) || getCurrentTenantId();

      if (payload.event === "payment.captured") {
        if (payment.status !== "captured") {
          await this.paymentRepository.update(getEntityId(payment), {
            status: "captured",
            razorpayPaymentId: payload.payload?.payment?.entity?.id,
            razorpaySignature: signature
          });
          await this.enquiryRepository.update(payment.enquiryId.toString(), {
            paymentStatus: "captured",
            status: "payment_authorized"
          });

          await bookingLifecycleQueue.add(
            "payment-captured",
            {
              tenantId,
              paymentId: getEntityId(payment)
            },
            {
              jobId: `payment-captured:${getEntityId(payment)}`
            }
          );

          await recordUsageEvent("payment.captured", 1, {
            paymentId: getEntityId(payment)
          });
        }

        await this.paymentRepository.markOrderStatus(getEntityId(payment), orderId, "captured");
        await this.paymentRepository.releaseAutomationLock(getEntityId(payment));
      }

      if (payload.event === "payment.failed") {
        await this.paymentRepository.update(getEntityId(payment), {
          status: "failed",
          razorpayPaymentId: payload.payload?.payment?.entity?.id,
          razorpaySignature: signature
        });
        await this.paymentRepository.markOrderStatus(getEntityId(payment), orderId, "failed");
        await this.paymentRepository.releaseAutomationLock(getEntityId(payment));
        await paymentQueue.add(
          "payment-reminder",
          {
            tenantId,
            paymentId: getEntityId(payment)
          },
          {
            delay: 15 * 60_000,
            jobId: `payment-failed-retry:${getEntityId(payment)}:${Date.now()}`
          }
        );
      }

      await this.webhookReceiptRepository.markCompleted("razorpay", eventId, signature);
    } catch (error) {
      await this.webhookReceiptRepository.markFailed("razorpay", eventId, (error as Error).message, signature);
      throw error;
    }
  }

  async processReminder(paymentId: string): Promise<void> {
    const payment = await this.paymentRepository.claimForAutomation(paymentId);
    if (!payment) {
      return;
    }

    try {
      const enquiry = await this.enquiryRepository.findById(payment.enquiryId.toString());
      if (!enquiry) {
        await this.paymentRepository.releaseAutomationLock(paymentId);
        return;
      }

      const customer = await this.customerRepository.findById(enquiry.customerId.toString());
      if (!customer) {
        await this.paymentRepository.releaseAutomationLock(paymentId);
        return;
      }
      const tenantId = getTenantIdFromEntity(payment)
        || getTenantIdFromEntity(enquiry)
        || getTenantIdFromEntity(customer)
        || getCurrentTenantId();

      const isExpired = payment.expiresAt ? payment.expiresAt <= new Date() : false;
      const tenantConfig = await resolveCurrentTenantConfig();

      if ((payment.status === "failed" || isExpired) && payment.retryCount < tenantConfig.automation.paymentRetryLimit) {
        const proposal = payment.proposalId ? await this.proposalRepository.findById(payment.proposalId.toString()) : null;
        const quote = proposal ? await this.quoteRepository.findById(proposal.recommendedQuoteId.toString()) : null;

        if (!proposal || !quote?.normalizedOffer) {
          await this.paymentRepository.releaseAutomationLock(paymentId);
          return;
        }

        const newReceipt = `${payment.receipt}-r${payment.retryCount + 1}`;
        const newOrder = await this.razorpayService.createOrder({
          amount: Math.round(payment.amount * 100),
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
          recipient: customer.phone || "",
          body: {
            text: `I’ve refreshed your secure payment link for convenience. Your new order reference is ${newOrder.id}. Once completed, I’ll confirm everything immediately.`
          },
          idempotencyKey: `payment-retry-link:${paymentId}:${newOrder.id}`,
          tenantId
        });

        await paymentQueue.add(
          "payment-reminder",
          {
            tenantId,
            paymentId
          },
          {
            delay: Math.floor(env.PAYMENT_LINK_EXPIRY_MINUTES / 2) * 60_000,
            jobId: `payment-reminder:${paymentId}:${newOrder.id}`
          }
        );

        return;
      }

      if ((payment.status === "failed" || isExpired) && payment.retryCount >= tenantConfig.automation.paymentRetryLimit) {
        await this.notificationService.enqueue({
          type: "payment-manual-assistance",
          channel: "whatsapp",
          recipient: customer.phone || "",
          body: {
            text: "Your payment link has expired a few times, so I recommend a quick manual check-in. Our team can assist immediately to complete the booking smoothly."
          },
          idempotencyKey: `payment-manual-assistance:${paymentId}`,
          tenantId
        });
        await this.paymentRepository.releaseAutomationLock(paymentId);
        return;
      }

      await this.notificationService.enqueue({
        type: "payment-reminder",
        channel: "whatsapp",
        recipient: customer.phone || "",
        body: {
          text: "A quick reminder that your secure payment link is still active. Once completed, I’ll confirm the booking and coordinate the next steps immediately."
        },
        idempotencyKey: `payment-reminder:${paymentId}:${Date.now()}`,
        tenantId
      });

      if (payment.expiresAt) {
        const nextDelay = Math.max(15 * 60_000, Math.floor((payment.expiresAt.getTime() - Date.now()) / 2));
        await paymentQueue.add(
          "payment-reminder",
          {
            tenantId,
            paymentId
          },
          {
            delay: nextDelay,
            jobId: `payment-reminder:${paymentId}:${Date.now()}`
          }
        );
      }

      await this.paymentRepository.releaseAutomationLock(paymentId);
    } catch (error) {
      await this.paymentRepository.releaseAutomationLock(paymentId, (error as Error).message);
      throw error;
    }
  }
}
