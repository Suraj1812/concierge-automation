import { Job, Worker } from "bullmq";
import { bullMqConnection, isQueueBackendDisabled } from "../infrastructure/cache/redis";
import { deadLetterQueue, queueNames } from "../infrastructure/queue/queues";
import { executeRegisteredQueueJob, listRegisteredQueues, type QueueJobPayload } from "../infrastructure/queue/registry";
import { logger } from "../infrastructure/logging/logger";
import { metrics } from "../infrastructure/observability/metrics";

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
      ).catch((deadLetterError) => {
        logger.error("Failed to enqueue dead-letter job", {
          queue: worker.name,
          jobId: job.id,
          jobName: job.name,
          error: deadLetterError
        });
      });
    }
  });

  return worker;
};

export const startWorkers = async (): Promise<WorkerRegistry> => {
  if (isQueueBackendDisabled()) {
    logger.warn("Queue backend is disabled. Worker startup skipped.");

    return {
      close: async () => {}
    };
  }

  const workers = listRegisteredQueues().map(({ queueName, concurrency }) =>
    registerWorker(new Worker(
      queueName,
      async (job: Job<QueueJobPayload>) => {
        await executeRegisteredQueueJob(queueName, job.name, job.data);
      },
      { connection: bullMqConnection, concurrency }
    ))
  );

  return {
    close: async () => {
      const results = await Promise.allSettled(workers.map(async (worker) => worker.close()));
      const failures = results.flatMap((result) => (
        result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : String(result.reason)] : []
      ));

      if (failures.length > 0) {
        throw new Error(`Failed to close workers: ${failures.join("; ")}`);
      }
    }
  };
};
