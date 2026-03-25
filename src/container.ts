import { AuthRepository } from "./modules/auth/repository";
import { AuthService } from "./modules/auth/service";
import { AuthController } from "./modules/auth/controller";
import { TenantRepository } from "./modules/tenants/repository";
import { TenantService } from "./modules/tenants/service";
import { TenantController } from "./modules/tenants/controller";
import { DashboardService } from "./modules/dashboard/service";
import { DashboardController } from "./modules/dashboard/controller";
import { AuditRepository } from "./modules/audit/repository";
import { AuditService } from "./modules/audit/service";
import { AuditController } from "./modules/audit/controller";
import { CustomerRepository } from "./modules/users/repository";
import { CustomerService } from "./modules/users/service";
import { OpenAIService } from "./modules/integrations/openai.service";
import { WhatsAppService } from "./modules/integrations/whatsapp.service";
import { EmailService } from "./modules/integrations/email.service";
import { PdfService } from "./modules/integrations/pdf.service";
import { RazorpayService } from "./modules/integrations/razorpay.service";
import { EnquiryRepository } from "./modules/enquiries/repository";
import { EnquiryService } from "./modules/enquiries/service";
import { EnquiryController } from "./modules/enquiries/controller";
import { VendorRepository } from "./modules/vendors/repository";
import { VendorService } from "./modules/vendors/service";
import { VendorController } from "./modules/vendors/controller";
import { VendorCommunicationService } from "./modules/vendors/communication.service";
import { VendorResponseService } from "./modules/vendors/vendor-response.service";
import { VendorResponseController } from "./modules/vendors/vendor-response.controller";
import { NotificationRepository } from "./modules/notifications/repository";
import { NotificationService } from "./modules/notifications/service";
import { QuoteRepository } from "./modules/quotes/repository";
import { QuoteController } from "./modules/quotes/controller";
import { QuoteService } from "./modules/quotes/service";
import { DecisionEngineService } from "./modules/quotes/decision-engine.service";
import { ProposalRepository } from "./modules/proposals/repository";
import { ProposalController } from "./modules/proposals/controller";
import { ProposalService } from "./modules/proposals/service";
import { PaymentRepository } from "./modules/payments/repository";
import { PaymentController } from "./modules/payments/controller";
import { PaymentService } from "./modules/payments/service";
import { BookingRepository } from "./modules/bookings/repository";
import { BookingController } from "./modules/bookings/controller";
import { BookingService } from "./modules/bookings/service";
import { ConversationRepository } from "./modules/conversations/repository";
import { ConversationController } from "./modules/conversations/controller";
import { ConversationService } from "./modules/conversations/service";
import { WebhookReceiptRepository } from "./modules/integrations/webhook-receipt.repository";
import { WhatsAppWebhookController } from "./modules/integrations/whatsapp.controller";
import { EmailMessageRepository } from "./modules/emails/repository";
import { EmailAutomationService } from "./modules/emails/service";
import { EmailAutomationController } from "./modules/emails/controller";
import { ConnectorController } from "./modules/connectors/controller";
import { ConnectorService } from "./modules/connectors/service";
import { conversationQueue, queueNames } from "./infrastructure/queue/queues";
import { registerQueueProcessor } from "./infrastructure/queue/registry";
import { logger } from "./infrastructure/logging/logger";

export const tenantRepository = new TenantRepository();
export const tenantService = new TenantService(tenantRepository);
export const tenantController = new TenantController(tenantService);

export const authRepository = new AuthRepository();
export const authService = new AuthService(authRepository, tenantService);
export const authController = new AuthController(authService);

export const auditRepository = new AuditRepository();
export const auditService = new AuditService(auditRepository);
export const auditController = new AuditController(auditService);
export const dashboardService = new DashboardService();
export const dashboardController = new DashboardController(dashboardService);

export const customerRepository = new CustomerRepository();
export const customerService = new CustomerService(customerRepository);

export const openAIService = new OpenAIService();
export const whatsAppService = new WhatsAppService();
export const emailService = new EmailService();
export const pdfService = new PdfService();
export const razorpayService = new RazorpayService();

export const webhookReceiptRepository = new WebhookReceiptRepository();

export const enquiryRepository = new EnquiryRepository();
export const enquiryService = new EnquiryService(enquiryRepository);
export const enquiryController = new EnquiryController(enquiryService);

export const vendorRepository = new VendorRepository();
export const vendorService = new VendorService(vendorRepository, enquiryRepository);
export const vendorController = new VendorController(vendorService);
export const vendorCommunicationService = new VendorCommunicationService(
  vendorRepository,
  enquiryRepository,
  whatsAppService,
  emailService
);

export const notificationRepository = new NotificationRepository();
export const notificationService = new NotificationService(notificationRepository, whatsAppService, emailService);
export const emailMessageRepository = new EmailMessageRepository();
export const emailAutomationService = new EmailAutomationService(
  emailMessageRepository,
  customerService,
  enquiryService,
  openAIService,
  emailService,
  vendorService
);
export const emailAutomationController = new EmailAutomationController(emailAutomationService);

export const decisionEngineService = new DecisionEngineService();
export const quoteRepository = new QuoteRepository();
export const quoteService = new QuoteService(
  quoteRepository,
  enquiryRepository,
  vendorRepository,
  openAIService,
  decisionEngineService
);
export const quoteController = new QuoteController(quoteService);
export const vendorResponseService = new VendorResponseService(vendorRepository, quoteService);
export const vendorResponseController = new VendorResponseController(vendorResponseService, webhookReceiptRepository);
export const connectorService = new ConnectorService(
  emailAutomationService,
  vendorResponseService,
  webhookReceiptRepository,
  async (payload) => {
    await conversationQueue.add(
      "whatsapp-inbound",
      payload,
      {
        jobId: `whatsapp:${payload.messageId}`
      }
    );
  }
);
export const connectorController = new ConnectorController(
  connectorService
);

export const proposalRepository = new ProposalRepository();
export const proposalService = new ProposalService(
  proposalRepository,
  quoteRepository,
  enquiryRepository,
  customerRepository,
  vendorRepository,
  pdfService,
  openAIService,
  notificationService,
  decisionEngineService
);
export const proposalController = new ProposalController(proposalService);

export const paymentRepository = new PaymentRepository();
export const paymentService = new PaymentService(
  paymentRepository,
  proposalRepository,
  enquiryRepository,
  quoteRepository,
  customerRepository,
  razorpayService,
  webhookReceiptRepository,
  notificationService
);
export const paymentController = new PaymentController(paymentService);

export const bookingRepository = new BookingRepository();
export const bookingService = new BookingService(
  bookingRepository,
  paymentRepository,
  proposalRepository,
  enquiryRepository,
  customerRepository,
  quoteRepository,
  notificationService,
  vendorRepository
);
export const bookingController = new BookingController(bookingService);

export const conversationRepository = new ConversationRepository();
export const conversationService = new ConversationService(
  conversationRepository,
  customerService,
  enquiryService,
  openAIService,
  notificationService,
  vendorService,
  auditService
);
export const conversationController = new ConversationController(conversationService);

export const whatsAppWebhookController = new WhatsAppWebhookController(whatsAppService, webhookReceiptRepository);

registerQueueProcessor({
  queueName: queueNames.conversationProcessing,
  jobName: "whatsapp-inbound",
  concurrency: 15,
  handler: async (payload) => {
    await conversationService.processInboundWhatsApp({
      phone: String(payload.phone),
      name: typeof payload.name === "string" ? payload.name : undefined,
      whatsappUserId: typeof payload.whatsappUserId === "string" ? payload.whatsappUserId : undefined,
      messageId: String(payload.messageId),
      text: String(payload.text)
    });
  }
});

registerQueueProcessor({
  queueName: queueNames.customerFollowUp,
  jobName: "conversation-clarification-follow-up",
  concurrency: 10,
  handler: async (payload) => {
    await conversationService.processClarificationFollowUp({
      conversationId: String(payload.conversationId),
      customerId: String(payload.customerId),
      enquiryId: String(payload.enquiryId),
      scheduledFrom: String(payload.scheduledFrom)
    });
  }
});

registerQueueProcessor({
  queueName: queueNames.customerFollowUp,
  jobName: "proposal-review-follow-up",
  concurrency: 10,
  handler: async (payload) => {
    await proposalService.processProposalFollowUp(String(payload.proposalId));
  }
});

registerQueueProcessor({
  queueName: queueNames.vendorOutreach,
  jobName: "vendor-outreach",
  concurrency: 10,
  handler: async (payload) => {
    await vendorCommunicationService.sendVendorRequest(String(payload.vendorRequestId));
  }
});

registerQueueProcessor({
  queueName: queueNames.vendorFollowUp,
  jobName: "vendor-follow-up",
  concurrency: 10,
  handler: async (payload) => {
    await vendorCommunicationService.followUpVendorRequest(String(payload.vendorRequestId));
  }
});

registerQueueProcessor({
  queueName: queueNames.quoteNormalization,
  jobName: "quote-normalization",
  concurrency: 10,
  handler: async (payload) => {
    await quoteService.normalizeQuote(String(payload.quoteId));
  }
});

registerQueueProcessor({
  queueName: queueNames.proposalGeneration,
  jobName: "proposal-generation",
  concurrency: 5,
  handler: async (payload) => {
    await proposalService.generateForEnquiry(String(payload.enquiryId));
  }
});

registerQueueProcessor({
  queueName: queueNames.notifications,
  jobName: "*",
  concurrency: 20,
  handler: async (payload) => {
    await notificationService.process(String(payload.notificationId));
  }
});

registerQueueProcessor({
  queueName: queueNames.bookingLifecycle,
  jobName: "payment-captured",
  concurrency: 10,
  handler: async (payload) => {
    await bookingService.createOrUpdateFromPayment(String(payload.paymentId));
  }
});

registerQueueProcessor({
  queueName: queueNames.bookingLifecycle,
  jobName: "service-reminder",
  concurrency: 10,
  handler: async (payload) => {
    await bookingService.processServiceReminder(String(payload.bookingId));
  }
});

registerQueueProcessor({
  queueName: queueNames.bookingLifecycle,
  jobName: "day-of-service-checkin",
  concurrency: 10,
  handler: async (payload) => {
    await bookingService.processDayOfServiceCheckIn(String(payload.bookingId));
  }
});

registerQueueProcessor({
  queueName: queueNames.bookingLifecycle,
  jobName: "post-service-follow-up",
  concurrency: 10,
  handler: async (payload) => {
    await bookingService.processPostServiceFollowUp(String(payload.bookingId));
  }
});

registerQueueProcessor({
  queueName: queueNames.payments,
  jobName: "payment-reminder",
  concurrency: 10,
  handler: async (payload) => {
    await paymentService.processReminder(String(payload.paymentId));
  }
});

registerQueueProcessor({
  queueName: queueNames.deadLetter,
  jobName: "dead-letter",
  concurrency: 1,
  handler: async (payload) => {
    logger.error("Dead-letter queue event captured", {
      payload
    });
  }
});
