import { Worker } from "bullmq";
import { bullMqConnection } from "../infrastructure/cache/redis";
import { queueNames } from "../infrastructure/queue/queues";
import {
  bookingService,
  conversationService,
  notificationService,
  paymentService,
  proposalService,
  quoteService,
  vendorCommunicationService
} from "../container";

export const startWorkers = async (): Promise<void> => {
  new Worker(
    queueNames.conversationProcessing,
    async (job) => {
      await conversationService.processInboundWhatsApp(job.data);
    },
    { connection: bullMqConnection, concurrency: 15 }
  );

  new Worker(
    queueNames.customerFollowUp,
    async (job) => {
      if (job.name === "conversation-clarification-follow-up") {
        await conversationService.processClarificationFollowUp(job.data as {
          conversationId: string;
          customerId: string;
          enquiryId: string;
          scheduledFrom: string;
        });
      }

      if (job.name === "proposal-review-follow-up") {
        await proposalService.processProposalFollowUp(job.data.proposalId as string);
      }
    },
    { connection: bullMqConnection, concurrency: 10 }
  );

  new Worker(
    queueNames.vendorOutreach,
    async (job) => {
      await vendorCommunicationService.sendVendorRequest(job.data.vendorRequestId as string);
    },
    { connection: bullMqConnection, concurrency: 10 }
  );

  new Worker(
    queueNames.vendorFollowUp,
    async (job) => {
      await vendorCommunicationService.followUpVendorRequest(job.data.vendorRequestId as string);
    },
    { connection: bullMqConnection, concurrency: 10 }
  );

  new Worker(
    queueNames.quoteNormalization,
    async (job) => {
      await quoteService.normalizeQuote(job.data.quoteId as string);
    },
    { connection: bullMqConnection, concurrency: 10 }
  );

  new Worker(
    queueNames.proposalGeneration,
    async (job) => {
      await proposalService.generateForEnquiry(job.data.enquiryId as string);
    },
    { connection: bullMqConnection, concurrency: 5 }
  );

  new Worker(
    queueNames.notifications,
    async (job) => {
      await notificationService.process(job.data.notificationId as string);
    },
    { connection: bullMqConnection, concurrency: 20 }
  );

  new Worker(
    queueNames.bookingLifecycle,
    async (job) => {
      if (job.name === "payment-captured") {
        await bookingService.createOrUpdateFromPayment(job.data.paymentId as string);
      }

       if (job.name === "service-reminder") {
        await bookingService.processServiceReminder(job.data.bookingId as string);
      }

      if (job.name === "day-of-service-checkin") {
        await bookingService.processDayOfServiceCheckIn(job.data.bookingId as string);
      }

      if (job.name === "post-service-follow-up") {
        await bookingService.processPostServiceFollowUp(job.data.bookingId as string);
      }
    },
    { connection: bullMqConnection, concurrency: 10 }
  );

  new Worker(
    queueNames.payments,
    async (job) => {
      if (job.name === "payment-reminder") {
        await paymentService.processReminder(job.data.paymentId as string);
      }
    },
    { connection: bullMqConnection, concurrency: 10 }
  );
};
