import { Queue } from "bullmq";
import { bullMqConnection } from "../cache/redis";

export const queueNames = {
  conversationProcessing: "conversation-processing",
  customerFollowUp: "customer-follow-up",
  vendorOutreach: "vendor-outreach",
  vendorFollowUp: "vendor-follow-up",
  quoteNormalization: "quote-normalization",
  proposalGeneration: "proposal-generation",
  notifications: "notifications",
  bookingLifecycle: "booking-lifecycle",
  payments: "payments",
  deadLetter: "dead-letter"
} as const;

const defaultJobOptions = {
  attempts: 4,
  removeOnComplete: 1000,
  removeOnFail: 2000,
  backoff: {
    type: "exponential",
    delay: 10_000
  }
};

type QueueLike = {
  add: (name: string, data: unknown, options?: Record<string, unknown>) => Promise<unknown>;
};

const createQueue = (name: string): Queue | QueueLike => {
  if (process.env.DISABLE_QUEUE_BACKEND === "true") {
    return {
      add: async (_jobName: string, _data: unknown, _options?: Record<string, unknown>) => ({
        id: `inline-${name}-${Date.now()}`
      })
    };
  }

  return new Queue(name, {
    connection: bullMqConnection,
    defaultJobOptions
  });
};

export const conversationQueue = createQueue(queueNames.conversationProcessing);
export const customerFollowUpQueue = createQueue(queueNames.customerFollowUp);
export const vendorOutreachQueue = createQueue(queueNames.vendorOutreach);
export const vendorFollowUpQueue = createQueue(queueNames.vendorFollowUp);
export const quoteNormalizationQueue = createQueue(queueNames.quoteNormalization);
export const proposalGenerationQueue = createQueue(queueNames.proposalGeneration);
export const notificationQueue = createQueue(queueNames.notifications);
export const bookingLifecycleQueue = createQueue(queueNames.bookingLifecycle);
export const paymentQueue = createQueue(queueNames.payments);
export const deadLetterQueue = createQueue(queueNames.deadLetter);
