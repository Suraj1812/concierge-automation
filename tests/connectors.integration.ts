import assert from "node:assert/strict";
import http from "node:http";
import { MongoMemoryServer } from "mongodb-memory-server";

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
  const mongoBinaryDir = "/tmp/mongodb-memory-server-binaries";
  process.env.MONGOMS_DOWNLOAD_DIR = mongoBinaryDir;
  const mongo = new MongoMemoryServer({
    binary: {
      downloadDir: mongoBinaryDir
    },
    instance: {
      ip: "127.0.0.1",
      port: 27119
    }
  });
  await mongo.start(true);

  process.env.NODE_ENV = "test";
  process.env.APP_PORT = "4013";
  process.env.APP_NAME = "AI Concierge Connector Test";
  process.env.APP_BASE_URL = "http://127.0.0.1:4013";
  process.env.DEFAULT_TENANT_SLUG = "default";
  process.env.DEFAULT_TENANT_NAME = "Default Tenant";
  process.env.AUTOMATION_API_KEY = "connector-test-key-123456";
  process.env.JWT_SECRET = "x".repeat(48);
  process.env.JWT_EXPIRES_IN = "8h";
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.ADMIN_PASSWORD = "StrongPassword123";
  process.env.ADMIN_NAME = "Test Admin";
  process.env.MONGODB_URI = mongo.getUri("ai-concierge-connectors");
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
  process.env.EMAIL_WEBHOOK_SECRET = "email-webhook-secret";
  process.env.DEFAULT_CURRENCY = "INR";
  process.env.MAX_VENDOR_RETRY_ATTEMPTS = "3";
  process.env.VENDOR_RESPONSE_TIMEOUT_MINUTES = "180";
  process.env.PAYMENT_LINK_EXPIRY_MINUTES = "30";
  process.env.MAX_PAYMENT_RETRY_ATTEMPTS = "3";
  process.env.CUSTOMER_FOLLOW_UP_MINUTES = "5";
  process.env.SERVICE_REMINDER_HOURS_BEFORE = "0";
  process.env.POST_SERVICE_FOLLOW_UP_HOURS_AFTER = "0";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  process.env.RATE_LIMIT_MAX_REQUESTS = "1000";
  process.env.LOG_LEVEL = "error";

  const [
    { app },
    { connectDatabase, disconnectDatabase },
    { seedAdminUser },
    { runWithTenantContext },
    container,
    queues,
    { EnquiryModel },
    { QuoteModel },
    { EmailMessageModel },
    { VendorRequestModel },
    { redisConnection }
  ] = await Promise.all([
    import("../src/app"),
    import("../src/infrastructure/db/mongoose"),
    import("../src/modules/auth/admin-seed"),
    import("../src/infrastructure/tenancy/tenant-context"),
    import("../src/container"),
    import("../src/infrastructure/queue/queues"),
    import("../src/modules/enquiries/enquiry.model"),
    import("../src/modules/quotes/quote.model"),
    import("../src/modules/emails/email-message.model"),
    import("../src/modules/vendors/vendor-request.model"),
    import("../src/infrastructure/cache/redis")
  ]);

  container.openAIService.generateConciergeTurn = async () => ({
    replyText: "Absolutely. Please share your travel dates and I will continue curating options.",
    summary: "Luxury villa request awaiting dates.",
    title: "Luxury villa enquiry",
    serviceType: "villa" as const,
    extractedRequirements: {
      destination: "Dubai",
      guestCount: 6
    },
    missingFields: ["startDate", "endDate"],
    nextState: "awaiting_clarification" as const,
    nextAction: "clarify" as const,
    memoryUpdate: {
      shouldUpdate: false
    }
  });

  (queues.conversationQueue as unknown as { add: typeof queues.conversationQueue.add }).add = async (_name: string, data: unknown) => {
    await container.conversationService.processInboundWhatsApp(data as never);
    return {} as never;
  };

  await connectDatabase();
  await seedAdminUser();
  const tenant = await container.tenantService.resolveBySlug("default");
  const tenantId = String((tenant as unknown as { _id?: unknown; id?: string })._id || (tenant as unknown as { id?: string }).id);

  const server = await new Promise<http.Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
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

  const connectorHeaders = {
    "Content-Type": "application/json",
    Authorization: "Bearer connector-test-key-123456"
  };

  try {
    const connectorHealth = await request("/api/connectors/health", {
      headers: connectorHeaders
    });
    assert.equal(connectorHealth.status, 200);

    const inboundMessageId = "connector-message-1";
    const whatsappResponse = await request("/api/connectors/whatsapp/inbound", {
      method: "POST",
      headers: connectorHeaders,
      body: JSON.stringify({
        phone: "+919625553534",
        name: "Suraj",
        message: "I need a villa in Dubai",
        messageId: inboundMessageId
      })
    });

    assert.equal(whatsappResponse.status, 202);

    const duplicateWhatsApp = await request("/api/connectors/whatsapp/inbound", {
      method: "POST",
      headers: connectorHeaders,
      body: JSON.stringify({
        phone: "+919625553534",
        name: "Suraj",
        message: "I need a villa in Dubai",
        messageId: inboundMessageId
      })
    });

    assert.equal(duplicateWhatsApp.status, 200);
    assert.equal(duplicateWhatsApp.body.duplicate, true);

    const enquiry = await waitFor(
      async () => EnquiryModel.findOne().lean(),
      (item) => Boolean(item)
    );
    assert.ok(enquiry);
    assert.equal(await EnquiryModel.countDocuments(), 1);

    const emailResponse = await request("/api/connectors/email/inbound", {
      method: "POST",
      headers: connectorHeaders,
      body: JSON.stringify({
        from: "client@example.com",
        subject: "Need a Dubai villa",
        text: "We need a premium Dubai villa for 6 guests.",
        providerMessageId: "connector-email-1"
      })
    });

    assert.equal(emailResponse.status, 202);

    const duplicateEmail = await request("/api/connectors/email/inbound", {
      method: "POST",
      headers: connectorHeaders,
      body: JSON.stringify({
        from: "client@example.com",
        subject: "Need a Dubai villa",
        text: "We need a premium Dubai villa for 6 guests.",
        providerMessageId: "connector-email-1"
      })
    });

    assert.equal(duplicateEmail.status, 200);
    assert.equal(duplicateEmail.body.duplicate, true);

    await waitFor(
      async () => EmailMessageModel.countDocuments(),
      (count) => count >= 2
    );

    const { vendorRequest } = await runWithTenantContext(
      {
        tenantId,
        tenantSlug: tenant.slug,
        tenantName: tenant.name
      },
      async () => {
        const vendor = await container.vendorRepository.create({
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
        });

        const vendorRequest = await container.vendorRepository.createOrUpdateVendorRequest({
          enquiryId: String(enquiry!._id),
          vendorId: String((vendor as unknown as { _id?: unknown; id?: string })._id || (vendor as unknown as { id?: string }).id),
          communicationChannel: "email"
        });

        return {
          vendor,
          vendorRequest
        };
      }
    );

    assert.ok(vendorRequest.vendorReference);
    await waitFor(
      async () => VendorRequestModel.countDocuments(),
      (count) => count === 1
    );

    const vendorResponse = await request("/api/connectors/vendor-responses/inbound", {
      method: "POST",
      headers: connectorHeaders,
      body: JSON.stringify({
        externalEventId: "connector-vendor-1",
        vendorReference: vendorRequest.vendorReference,
        rawPayload: `Reference: ${vendorRequest.vendorReference}\nWe can offer a premium villa for INR 38,50,000.`
      })
    });

    assert.equal(vendorResponse.status, 202);

    const duplicateVendorResponse = await request("/api/connectors/vendor-responses/inbound", {
      method: "POST",
      headers: connectorHeaders,
      body: JSON.stringify({
        externalEventId: "connector-vendor-1",
        vendorReference: vendorRequest.vendorReference,
        rawPayload: `Reference: ${vendorRequest.vendorReference}\nWe can offer a premium villa for INR 38,50,000.`
      })
    });

    assert.equal(duplicateVendorResponse.status, 200);
    assert.equal(duplicateVendorResponse.body.duplicate, true);

    await waitFor(
      async () => QuoteModel.countDocuments(),
      (count) => count === 1
    );

    console.log("Connector integration test passed");
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
