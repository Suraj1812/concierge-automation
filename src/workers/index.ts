import { Job, Worker } from "bullmq";
import { bullMqConnection } from "../infrastructure/cache/redis";
import { deadLetterQueue, queueNames } from "../infrastructure/queue/queues";
import { logger } from "../infrastructure/logging/logger";
import { metrics } from "../infrastructure/observability/metrics";
import {
  bookingService,
  conversationService,
  notificationService,
  paymentService,
  proposalService,
  quoteService,
  vendorCommunicationService
} from "../container";

type WorkerRegistry = {
  close: () => Promise<void>;
};

const registerWorker = (worker: Worker): Worker => {
  worker.on("completed", (job: Job) => {
    metrics.increment("queue_jobs_completed_total", {
      queue: worker.name,
      jobName: job.name
    });
  });

  worker.on("failed", (job, error) => {
    if (!job) {
      return;
    }

    metrics.increment("queue_jobs_failed_total", {
      queue: worker.name,
      jobName: job.name
    });

    logger.error("Queue job failed", {
      queue: worker.name,
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      data: job.data,
      error
    });

    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      void deadLetterQueue.add(
        "dead-letter",
        {
          queue: worker.name,
          jobId: job.id,
          jobName: job.name,
          attemptsMade: job.attemptsMade,
          failedReason: error.message,
          stack: error.stack,
          data: job.data
        },
        {
          jobId: `dlq:${worker.name}:${job.id}`
        }
      );
    }
  });

  return worker;
};

export const startWorkers = async (): Promise<WorkerRegistry> => {
  const workers = [
    registerWorker(new Worker(
    queueNames.conversationProcessing,
    async (job) => {
      await conversationService.processInboundWhatsApp(job.data);
    },
    { connection: bullMqConnection, concurrency: 15 }
  )),

    registerWorker(new Worker(
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
  )),

    registerWorker(new Worker(
    queueNames.vendorOutreach,
    async (job) => {
      await vendorCommunicationService.sendVendorRequest(job.data.vendorRequestId as string);
    },
    { connection: bullMqConnection, concurrency: 10 }
  )),

    registerWorker(new Worker(
    queueNames.vendorFollowUp,
    async (job) => {
      await vendorCommunicationService.followUpVendorRequest(job.data.vendorRequestId as string);
    },
    { connection: bullMqConnection, concurrency: 10 }
  )),

    registerWorker(new Worker(
    queueNames.quoteNormalization,
    async (job) => {
      await quoteService.normalizeQuote(job.data.quoteId as string);
    },
    { connection: bullMqConnection, concurrency: 10 }
  )),

    registerWorker(new Worker(
    queueNames.proposalGeneration,
    async (job) => {
      await proposalService.generateForEnquiry(job.data.enquiryId as string);
    },
    { connection: bullMqConnection, concurrency: 5 }
  )),

    registerWorker(new Worker(
    queueNames.notifications,
    async (job) => {
      await notificationService.process(job.data.notificationId as string);
    },
    { connection: bullMqConnection, concurrency: 20 }
  )),

    registerWorker(new Worker(
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
  )),

    registerWorker(new Worker(
    queueNames.payments,
    async (job) => {
      if (job.name === "payment-reminder") {
        await paymentService.processReminder(job.data.paymentId as string);
      }
    },
    { connection: bullMqConnection, concurrency: 10 }
  ))
  ];

  return {
    close: async () => {
      await Promise.all(workers.map(async (worker) => worker.close()));
    }
  };
};
