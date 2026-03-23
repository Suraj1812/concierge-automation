import assert from "node:assert/strict";
import crypto from "node:crypto";
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
  const port = 4012;

  process.env.NODE_ENV = "test";
  process.env.APP_PORT = String(port);
  process.env.APP_NAME = "AI Concierge Hardening Test";
  process.env.APP_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JWT_SECRET = "x".repeat(48);
  process.env.JWT_EXPIRES_IN = "8h";
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "StrongPassword123";
  process.env.ADMIN_NAME = "Test Admin";
  process.env.MONGODB_URI = mongo.getUri("ai-concierge-hardening");
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
  process.env.MAX_VENDOR_RETRY_ATTEMPTS = "1";
  process.env.VENDOR_RESPONSE_TIMEOUT_MINUTES = "180";
  process.env.PAYMENT_LINK_EXPIRY_MINUTES = "30";
  process.env.MAX_PAYMENT_RETRY_ATTEMPTS = "2";
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
    { QuoteModel },
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
    import("../src/modules/quotes/quote.model"),
    import("../src/modules/proposals/proposal.model"),
    import("../src/modules/bookings/booking.model"),
    import("../src/modules/vendors/vendor-request.model"),
    import("../src/modules/notifications/notification.model"),
    import("../src/infrastructure/cache/redis")
  ]);

  const sentDocumentLinks: string[] = [];
  const sentTexts: string[] = [];
  let orderSequence = 0;

  container.openAIService.generateConciergeTurn = async () => ({
    replyText: "Absolutely. I’m curating a premium shortlist for you now.",
    summary: "Luxury Dubai villa request for 6 guests.",
    title: "Luxury Dubai villa stay",
    serviceType: "villa" as const,
    extractedRequirements: {
      destination: "Dubai",
      startDate: new Date(Date.now() + 60_000).toISOString(),
      endDate: new Date(Date.now() + 120_000).toISOString(),
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
    inclusions: ["Beachfront access", "Private chef"],
    exclusions: ["Airport taxes"],
    totalAmount: 3850000,
    currency: "INR",
    terms: ["Non-refundable after confirmation"],
    availabilityStatus: "Available",
    cancellationPolicy: "48 hours before arrival",
    aiSummary: "Strong-fit premium villa option."
  });

  container.openAIService.generateProposalCopy = async () => ({
    summary: "We recommend the Palm Jumeirah Signature Villa as the strongest fit for this request.",
    premiumMessage: "I’ve prepared your curated proposal and selected the strongest option for comfort, privacy, and overall fit."
  });

  container.whatsAppService.sendTextMessage = async (_to: string, text: string) => {
    sentTexts.push(text);
  };

  container.whatsAppService.sendDocumentMessage = async (_to: string, link: string) => {
    sentDocumentLinks.push(link);
  };

  container.emailService.sendVendorRequest = async () => undefined;

  container.razorpayService.createOrder = async ({ receipt }) => {
    orderSequence += 1;
    return {
      id: `order_${orderSequence}`,
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

  (queues.paymentQueue as unknown as { add: typeof queues.paymentQueue.add }).add = async () => ({} as never);
  (queues.customerFollowUpQueue as unknown as { add: typeof queues.customerFollowUpQueue.add }).add = async () => ({} as never);

  (queues.bookingLifecycleQueue as unknown as { add: typeof queues.bookingLifecycleQueue.add }).add = async (name, data) => {
    if (name === "payment-captured") {
      await container.bookingService.createOrUpdateFromPayment((data as { paymentId: string }).paymentId);
    }

    return {} as never;
  };

  await connectDatabase();
  await seedAdminUser();

  const server = app.listen(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
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

    for (const [index, name] of ["Azure Palm Villas", "Ocean Crest Estates"].entries()) {
      const response = await request("/api/vendors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": `vendor-create-${index + 1}`
        },
        body: JSON.stringify({
          name,
          categories: ["villa"],
          supportedServices: ["villa"],
          geoCoverage: ["Dubai"],
          capabilities: ["beachfront", "private chef"],
          contactPoints: [
            {
              channel: "email",
              value: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`
            }
          ],
          rating: 4.9 - index * 0.1,
          responseSlaHours: 2,
          priorityWeight: 2,
          isActive: true
        })
      });

      assert.equal(response.status, 201);
    }

    const inboundMessage = {
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ profile: { name: "Aarav" }, wa_id: "919999999999" }],
                messages: [
                  {
                    id: "wamid.customer.duplicate-1",
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
    const firstInbound = await request("/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sign("whatsapp-secret", inboundBody)
      },
      body: inboundBody
    });
    const duplicateInbound = await request("/api/webhooks/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-hub-signature-256": sign("whatsapp-secret", inboundBody)
      },
      body: inboundBody
    });

    assert.equal(firstInbound.status, 200);
    assert.equal(duplicateInbound.status, 200);

    const enquiry = await waitFor(
      async () => EnquiryModel.findOne().lean(),
      (item) => Boolean(item)
    );
    assert.ok(enquiry);
    assert.equal(await EnquiryModel.countDocuments(), 1);
    assert.equal(await NotificationModel.countDocuments({ type: "concierge-reply" }), 1);
    assert.equal(sentTexts.filter((text) => text.includes("curating a premium shortlist")).length, 1);

    const vendorRequests = await waitFor(
      async () => VendorRequestModel.find({ enquiryId: enquiry!._id }).sort({ createdAt: 1 }).lean(),
      (items) => items.length === 2
    );
    const [firstVendorRequest, secondVendorRequest] = vendorRequests;
    assert.ok(firstVendorRequest.vendorReference);
    assert.ok(secondVendorRequest.vendorReference);

    const vendorReplyPayload = {
      externalEventId: "vendor-event-duplicate-1",
      rawPayload: `Reference: ${firstVendorRequest.vendorReference}\nWe can offer a beachfront villa with private chef for INR 38,50,000.`
    };
    const vendorReplyBody = JSON.stringify(vendorReplyPayload);

    const firstVendorReply = await request("/api/webhooks/vendor-responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vendor-signature": sign("vendor-secret", vendorReplyBody)
      },
      body: vendorReplyBody
    });
    const duplicateVendorReply = await request("/api/webhooks/vendor-responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-vendor-signature": sign("vendor-secret", vendorReplyBody)
      },
      body: vendorReplyBody
    });

    assert.equal(firstVendorReply.status, 202);
    assert.equal(duplicateVendorReply.status, 200);

    await waitFor(
      async () => QuoteModel.countDocuments(),
      (count) => count === 1
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await ProposalModel.countDocuments(), 0);

    await container.vendorCommunicationService.followUpVendorRequest(String(secondVendorRequest._id));

    const proposal = await waitFor(
      async () => ProposalModel.findOne({ enquiryId: enquiry!._id }).lean(),
      (item) => Boolean(item)
    );
    assert.ok(proposal);

    assert.equal(sentDocumentLinks.length, 1);
    const sharedDocumentUrl = new URL(sentDocumentLinks[0]);
    const sharedToken = sharedDocumentUrl.searchParams.get("token");
    assert.ok(sharedToken);

    const deniedDocumentResponse = await fetch(`${baseUrl}${sharedDocumentUrl.pathname}?token=${"a".repeat(48)}`);
    assert.equal(deniedDocumentResponse.status, 404);

    const allowedDocumentResponse = await fetch(`${baseUrl}${sharedDocumentUrl.pathname}?token=${sharedToken}`);
    assert.equal(allowedDocumentResponse.status, 200);
    assert.equal(allowedDocumentResponse.headers.get("content-type"), "application/pdf");

    const createOrderResponse = await request("/api/payments/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": "payment-order-hardening-1"
      },
      body: JSON.stringify({
        enquiryId: enquiry!._id.toString(),
        proposalId: proposal!._id.toString()
      })
    });

    assert.equal(createOrderResponse.status, 201);
    const orderId = createOrderResponse.body.data.orderId as string;

    const paymentWebhookPayload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: "pay_duplicate_1",
            order_id: orderId
          }
        }
      }
    };

    const paymentWebhookBody = JSON.stringify(paymentWebhookPayload);
    const firstPaymentWebhook = await request("/api/payments/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signRaw("razorpay-webhook-secret", paymentWebhookBody)
      },
      body: paymentWebhookBody
    });
    const duplicatePaymentWebhook = await request("/api/payments/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signRaw("razorpay-webhook-secret", paymentWebhookBody)
      },
      body: paymentWebhookBody
    });

    assert.equal(firstPaymentWebhook.status, 200);
    assert.equal(duplicatePaymentWebhook.status, 200);

    await waitFor(
      async () => BookingModel.countDocuments(),
      (count) => count === 1
    );

    console.log("Hardening integration test passed");
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
