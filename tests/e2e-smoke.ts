import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

const sign = (secret: string, payload: string): string =>
  `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

const signRaw = (secret: string, payload: string): string =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

const waitFor = async <T>(factory: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 10_000): Promise<T> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await factory();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("Timed out waiting for condition");
};

const main = async (): Promise<void> => {
  const mongo = await MongoMemoryServer.create();
  const now = Date.now();

  process.env.NODE_ENV = "test";
  process.env.APP_PORT = "4001";
  process.env.APP_NAME = "AI Concierge System Test";
  process.env.APP_BASE_URL = "http://127.0.0.1";
  process.env.JWT_SECRET = "x".repeat(48);
  process.env.JWT_EXPIRES_IN = "8h";
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "StrongPassword123";
  process.env.ADMIN_NAME = "Test Admin";
  process.env.MONGODB_URI = mongo.getUri("ai-concierge-smoke");
  process.env.REDIS_HOST = "127.0.0.1";
  process.env.REDIS_PORT = "6379";
  process.env.REDIS_PASSWORD = "";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_MODEL = "gpt-4.1-mini";
  process.env.DISABLE_QUEUE_BACKEND = "true";
  process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";
  process.env.WHATSAPP_APP_SECRET = "whatsapp-secret";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.WHATSAPP_ACCESS_TOKEN = "token";
  process.env.WHATSAPP_API_VERSION = "v21.0";
  process.env.VENDOR_WEBHOOK_SECRET = "vendor-secret";
  process.env.RAZORPAY_KEY_ID = "rzp_test_123";
  process.env.RAZORPAY_KEY_SECRET = "razorpay-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "razorpay-webhook-secret";
  process.env.PDF_STORAGE_PATH = "storage/proposals";
  process.env.SMTP_FROM = "luxury.concierge@example.com";
  process.env.DEFAULT_CURRENCY = "INR";
  process.env.MAX_VENDOR_RETRY_ATTEMPTS = "3";
  process.env.VENDOR_RESPONSE_TIMEOUT_MINUTES = "180";
  process.env.PAYMENT_LINK_EXPIRY_MINUTES = "30";
  process.env.MAX_PAYMENT_RETRY_ATTEMPTS = "3";
  process.env.CUSTOMER_FOLLOW_UP_MINUTES = "1";
  process.env.SERVICE_REMINDER_HOURS_BEFORE = "0";
  process.env.POST_SERVICE_FOLLOW_UP_HOURS_AFTER = "0";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_MAX_REQUESTS = "1000";
  process.env.LOG_LEVEL = "error";

  const [
    { app },
    { connectDatabase, disconnectDatabase },
    { seedAdminUser },
    container,
    queues,
    { EnquiryModel },
    { ProposalModel },
    { BookingModel },
    { VendorRequestModel },
    { NotificationModel },
    { redisConnection }
  ] = await Promise.all([
    import("../src/app"),
    import("../src/infrastructure/db/mongoose"),
    import("../src/modules/auth/admin-seed"),
    import("../src/container"),
    import("../src/infrastructure/queue/queues"),
    import("../src/modules/enquiries/enquiry.model"),
    import("../src/modules/proposals/proposal.model"),
    import("../src/modules/bookings/booking.model"),
    import("../src/modules/vendors/vendor-request.model"),
    import("../src/modules/notifications/notification.model"),
    import("../src/infrastructure/cache/redis")
  ]);

  const sentMessages: Array<{ channel: string; to: string; body: string }> = [];
  const generatedOrders: string[] = [];
  const pendingBookingJobs: Array<{ name: string; data: Record<string, unknown> }> = [];

  container.openAIService.generateConciergeTurn = async () => ({
    replyText: "Absolutely. I’m curating a premium shortlist for you now.",
    summary: "Luxury Dubai villa request for 6 guests.",
    title: "Luxury Dubai villa stay",
    serviceType: "villa" as const,
    extractedRequirements: {
      destination: "Dubai",
      startDate: new Date(now + 3_000).toISOString(),
      endDate: new Date(now + 5_000).toISOString(),
      guestCount: 6,
      budgetMax: 4000000,
      preferences: ["beachfront", "private chef"],
      notes: "High-touch luxury experience"
    },
    missingFields: [],
    nextState: "vendor_discovery" as const,
    nextAction: "vendor_match" as const,
    memoryUpdate: {
      shouldUpdate: true,
      summary: "Client prefers premium beachfront stays in Dubai.",
      preferences: {
        destinations: ["Dubai"],
        tone: "premium"
      }
    }
  });

  container.openAIService.normalizeQuote = async () => ({
    title: "Palm Jumeirah Signature Villa",
    inclusions: ["Beachfront access", "Private chef", "Daily housekeeping"],
    exclusions: ["Airport taxes"],
    totalAmount: 3850000,
    currency: "INR",
    terms: ["Non-refundable after confirmation"],
    availabilityStatus: "Available",
    cancellationPolicy: "48 hours before arrival",
    aiSummary: "Best-fit luxury beachfront villa with premium inclusions."
  });

  container.openAIService.generateProposalCopy = async () => ({
    summary: "We recommend the Palm Jumeirah Signature Villa as the strongest fit for the requested dates, guest count, and premium beachfront preference.",
    premiumMessage: "I’ve prepared your curated proposal and selected the strongest option for comfort, privacy, and overall fit. I’m sharing it with you now."
  });

  container.whatsAppService.sendTextMessage = async (to: string, text: string) => {
    sentMessages.push({ channel: "whatsapp-text", to, body: text });
  };

  container.whatsAppService.sendDocumentMessage = async (to: string, _link: string, filename: string, caption: string) => {
    sentMessages.push({ channel: "whatsapp-document", to, body: `${filename}:${caption}` });
  };

  container.emailService.sendVendorRequest = async (to: string, subject: string, text: string) => {
    sentMessages.push({ channel: "email", to, body: `${subject}\n${text}` });
  };

  container.razorpayService.createOrder = async ({ receipt }) => {
    const id = `order_${generatedOrders.length + 1}`;
    generatedOrders.push(id);
    return {
      id,
      entity: "order",
      amount: 385000000,
      amount_paid: 0,
      amount_due: 385000000,
      currency: "INR",
      receipt,
      offer_id: null,
      status: "created",
      attempts: 0,
      notes: {},
      created_at: Math.floor(Date.now() / 1000)
    };
  };

  (queues.conversationQueue as unknown as { add: typeof queues.conversationQueue.add }).add = async (_name, data) => {
    await container.conversationService.processInboundWhatsApp(data as never);
    return {} as never;
  };

  (queues.vendorOutreachQueue as unknown as { add: typeof queues.vendorOutreachQueue.add }).add = async (_name, data) => {
    await container.vendorCommunicationService.sendVendorRequest((data as { vendorRequestId: string }).vendorRequestId);
    return {} as never;
  };

  (queues.vendorFollowUpQueue as unknown as { add: typeof queues.vendorFollowUpQueue.add }).add = async () => ({} as never);

  (queues.quoteNormalizationQueue as unknown as { add: typeof queues.quoteNormalizationQueue.add }).add = async (_name, data) => {
    await container.quoteService.normalizeQuote((data as { quoteId: string }).quoteId);
    return {} as never;
  };

  (queues.proposalGenerationQueue as unknown as { add: typeof queues.proposalGenerationQueue.add }).add = async (_name, data) => {
    await container.proposalService.generateForEnquiry((data as { enquiryId: string }).enquiryId);
    return {} as never;
  };

  (queues.notificationQueue as unknown as { add: typeof queues.notificationQueue.add }).add = async (_name, data) => {
    await container.notificationService.process((data as { notificationId: string }).notificationId);
    return {} as never;
  };

  (queues.paymentQueue as unknown as { add: typeof queues.paymentQueue.add }).add = async (name, data) => {
    if (name === "payment-reminder") {
      return {} as never;
    }
    return {} as never;
  };

  (queues.customerFollowUpQueue as unknown as { add: typeof queues.customerFollowUpQueue.add }).add = async () => ({} as never);

  (queues.bookingLifecycleQueue as unknown as { add: typeof queues.bookingLifecycleQueue.add }).add = async (name, data) => {
    if (name === "payment-captured") {
      await container.bookingService.createOrUpdateFromPayment((data as { paymentId: string }).paymentId);
      return {} as never;
    }

    pendingBookingJobs.push({
      name,
      data: data as Record<string, unknown>
    });
    return {} as never;
  };

  await connectDatabase();
  await seedAdminUser();

  const server = await new Promise<http.Server>((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server port");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : {}
    };
  };

  try {
    const loginResponse = await request("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "StrongPassword123"
      })
    });

    assert.equal(loginResponse.status, 200);
    const token = loginResponse.body.data.token as string;
    assert.ok(token);

    const createVendorResponse = await request("/api/vendors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "vendor-create-1"
      },
      body: JSON.stringify({
        name: "Azure Palm Villas",
        categories: ["villa"],
        supportedServices: ["villa"],
        geoCoverage: ["Dubai"],
        capabilities: ["beachfront", "private chef"],
        contactPoints: [
          {
            channel: "email",
            value: "reservations@azurepalm.example"
          }
        ],
        rating: 4.8,
        responseSlaHours: 2,
        priorityWeight: 2,
        isActive: true
      })
    });

    assert.equal(createVendorResponse.status, 201);

    const inboundMessage = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Aarav" }, wa_id: "919999999999" }],
                messages: [
                  {
                    id: "wamid.customer.1",
                    from: "919999999999",
                    type: "text",
                    text: {
                      body: "I need a luxury Dubai villa for 6 guests."
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    const inboundBody = JSON.stringify(inboundMessage);
    const inboundResponse = await request("/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sign("whatsapp-secret", inboundBody)
      },
      body: inboundBody
    });

    assert.equal(inboundResponse.status, 200);

    const enquiries = await waitFor(
      async () => EnquiryModel.find().lean(),
      (items) => items.length === 1
    );
    const enquiry = enquiries[0];
    assert.equal(enquiry.status, "awaiting_vendor_quotes");

    const vendorRequest = await waitFor(
      async () => VendorRequestModel.findOne({ enquiryId: enquiry._id }).lean(),
      (item) => Boolean(item)
    );
    assert.ok(vendorRequest?.vendorReference);

    const vendorReplyPayload = {
      externalEventId: "vendor-event-1",
      rawPayload: `Reference: ${vendorRequest.vendorReference}\nWe can offer a beachfront villa with private chef and daily housekeeping for INR 38,50,000.`
    };
    const vendorReplyBody = JSON.stringify(vendorReplyPayload);

    const vendorReplyResponse = await request("/api/webhooks/vendor-responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vendor-signature": sign("vendor-secret", vendorReplyBody)
      },
      body: vendorReplyBody
    });

    assert.equal(vendorReplyResponse.status, 202);

    const proposal = await waitFor(
      async () => ProposalModel.findOne({ enquiryId: enquiry._id }).lean(),
      (item) => Boolean(item)
    );
    assert.ok(proposal);

    const refreshedEnquiry = await EnquiryModel.findById(enquiry._id).lean();
    assert.equal(refreshedEnquiry?.status, "proposal_sent");

    const createOrderResponse = await request("/api/payments/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "payment-order-1"
      },
      body: JSON.stringify({
        enquiryId: enquiry._id.toString(),
        proposalId: proposal!._id.toString()
      })
    });

    assert.equal(createOrderResponse.status, 201);
    const orderId = createOrderResponse.body.data.orderId as string;
    assert.ok(orderId);

    const paymentWebhookPayload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_123",
            order_id: orderId
          }
        }
      }
    };

    const paymentWebhookBody = JSON.stringify(paymentWebhookPayload);
    const paymentWebhookResponse = await request("/api/payments/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signRaw("razorpay-webhook-secret", paymentWebhookBody)
      },
      body: paymentWebhookBody
    });

    assert.equal(paymentWebhookResponse.status, 200);

    const booking = await waitFor(
      async () => BookingModel.findOne({ enquiryId: enquiry._id }).lean(),
      (item) => Boolean(item)
    );
    assert.equal(booking?.status, "confirmed");

    for (const job of pendingBookingJobs) {
      const bookingId = String(job.data.bookingId);
      if (job.name === "service-reminder") {
        await container.bookingService.processServiceReminder(bookingId);
      }
      if (job.name === "day-of-service-checkin") {
        await container.bookingService.processDayOfServiceCheckIn(bookingId);
      }
      if (job.name === "post-service-follow-up") {
        await container.bookingService.processPostServiceFollowUp(bookingId);
      }
    }

    const completedBooking = await BookingModel.findById(booking!._id).lean();
    assert.equal(completedBooking?.status, "completed");

    const notifications = await NotificationModel.find().lean();
    assert.ok(notifications.length >= 5);
    assert.ok(sentMessages.some((message) => message.channel === "email" && message.body.includes("Luxury concierge sourcing request")));
    assert.ok(sentMessages.some((message) => message.channel === "whatsapp-document" && message.body.includes("proposal-")));
    assert.ok(sentMessages.some((message) => message.body.includes("Your booking is confirmed")));
    assert.ok(sentMessages.some((message) => message.body.includes("upcoming")));
    assert.ok(sentMessages.some((message) => message.body.includes("Today is the day")));
    assert.ok(sentMessages.some((message) => message.body.includes("I hope your")));

    console.log("Smoke test passed");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await disconnectDatabase();
    redisConnection.disconnect();
    await mongo.stop();
  }
};

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
