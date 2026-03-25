import { runWithTenantContext } from "../tenancy/tenant-context";

export type QueueJobPayload = Record<string, unknown> & {
  tenantId?: string;
};

type QueueJobHandler = (payload: QueueJobPayload) => Promise<void>;

type QueueProcessorRegistration = {
  queueName: string;
  jobName: string;
  concurrency: number;
  handler: QueueJobHandler;
};

const processorRegistry = new Map<string, QueueProcessorRegistration>();
const queueConcurrencyRegistry = new Map<string, number>();

const buildRegistryKey = (queueName: string, jobName: string): string => `${queueName}:${jobName}`;

export const registerQueueProcessor = (registration: QueueProcessorRegistration): void => {
  const existingConcurrency = queueConcurrencyRegistry.get(registration.queueName);
  if (existingConcurrency !== undefined && existingConcurrency !== registration.concurrency) {
    throw new Error(
      `Queue "${registration.queueName}" is already registered with concurrency ${existingConcurrency}, received ${registration.concurrency}`
    );
  }

  queueConcurrencyRegistry.set(registration.queueName, registration.concurrency);
  processorRegistry.set(buildRegistryKey(registration.queueName, registration.jobName), registration);
};

const resolveQueueProcessor = (queueName: string, jobName: string): QueueProcessorRegistration | undefined =>
  processorRegistry.get(buildRegistryKey(queueName, jobName))
  || processorRegistry.get(buildRegistryKey(queueName, "*"));

export const hasRegisteredQueueProcessor = (queueName: string, jobName: string): boolean =>
  Boolean(resolveQueueProcessor(queueName, jobName));

export const executeRegisteredQueueJob = async (
  queueName: string,
  jobName: string,
  payload: QueueJobPayload
): Promise<void> => {
  const registration = resolveQueueProcessor(queueName, jobName);
  if (!registration) {
    throw new Error(`No registered queue processor for ${queueName}:${jobName}`);
  }

  if (!payload.tenantId) {
    await registration.handler(payload);
    return;
  }

  await runWithTenantContext(
    {
      tenantId: payload.tenantId
    },
    () => registration.handler(payload)
  );
};

export const listRegisteredQueues = (): Array<{ queueName: string; concurrency: number }> =>
  Array.from(queueConcurrencyRegistry.entries()).map(([queueName, concurrency]) => ({
    queueName,
    concurrency
  }));
