import { Queue } from "bullmq";
import { bullMqConnection } from "../cache/redis";
import { isQueueBackendDisabled } from "../cache/redis";
import { logger } from "../logging/logger";
import { executeRegisteredQueueJob, hasRegisteredQueueProcessor, type QueueJobPayload } from "./registry";

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

type InlineJobRecord = {
  timer?: NodeJS.Timeout;
  inFlight: boolean;
};

const queueExecutionError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const inlineJobRegistry = new Map<string, InlineJobRecord>();

const buildInlineJobKey = (queueName: string, jobId: string): string => `${queueName}:${jobId}`;

const scheduleInlineQueueJob = (
  queueName: string,
  jobName: string,
  data: QueueJobPayload,
  options?: Record<string, unknown>
): void => {
  if (!hasRegisteredQueueProcessor(queueName, jobName)) {
    throw new Error(`Inline queue processor is not registered for ${queueName}:${jobName}`);
  }

  const delay = typeof options?.delay === "number" ? Math.max(0, options.delay) : 0;
  const jobId = typeof options?.jobId === "string" && options.jobId.trim().length > 0
    ? options.jobId
    : undefined;

  if (jobId) {
    const existing = inlineJobRegistry.get(buildInlineJobKey(queueName, jobId));
    if (existing) {
      return;
    }
  }

  const run = () => {
    const registryKey = jobId ? buildInlineJobKey(queueName, jobId) : undefined;

    if (registryKey) {
      inlineJobRegistry.set(registryKey, {
        inFlight: true
      });
    }

    void executeRegisteredQueueJob(queueName, jobName, data)
      .catch((error) => {
        logger.error("Inline queue job failed", {
          queue: queueName,
          jobName,
          data,
          error: queueExecutionError(error)
        });
      })
      .finally(() => {
        if (registryKey) {
          inlineJobRegistry.delete(registryKey);
        }
      });
  };

  if (delay === 0) {
    if (jobId) {
      inlineJobRegistry.set(buildInlineJobKey(queueName, jobId), {
        inFlight: false
      });
    }
    setImmediate(run);
    return;
  }

  const timer = setTimeout(run, delay);
  timer.unref?.();

  if (jobId) {
    inlineJobRegistry.set(buildInlineJobKey(queueName, jobId), {
      timer,
      inFlight: false
    });
  }
};

export const clearInlineQueueJobs = (): void => {
  for (const record of inlineJobRegistry.values()) {
    if (record.timer) {
      clearTimeout(record.timer);
    }
  }

  inlineJobRegistry.clear();
};

const createQueue = (name: string): QueueLike => {
  if (isQueueBackendDisabled()) {
    return {
      add: async (jobName: string, data: unknown, options?: Record<string, unknown>) => {
        if (!data || typeof data !== "object") {
          throw new Error(`Queue payload for ${name}:${jobName} must be an object`);
        }

        scheduleInlineQueueJob(name, jobName, data as QueueJobPayload, options);

        return {
        id: `inline-${name}-${Date.now()}`
        };
      }
    };
  }

  let queue: Queue | null = null;

  const getQueue = (): Queue => {
    if (!queue) {
      queue = new Queue(name, {
        connection: bullMqConnection,
        defaultJobOptions
      });
    }

    return queue;
  };

  return {
    add: (jobName: string, data: unknown, options?: Record<string, unknown>) => getQueue().add(jobName, data, options)
  };
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
