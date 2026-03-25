type RetryOptions = {
  attempts: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  shouldRetry?: (error: unknown, attemptNumber: number) => boolean;
  onRetry?: (error: unknown, attemptNumber: number, nextDelayMs: number) => void;
};

const sleep = async (delayMs: number): Promise<void> =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, delayMs);
    timer.unref?.();
  });

export const retryAsync = async <T>(
  operation: (attemptNumber: number) => Promise<T>,
  options: RetryOptions
): Promise<T> => {
  const attempts = Math.max(1, options.attempts);
  const initialDelayMs = options.initialDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 2_000;
  const factor = options.factor ?? 2;

  let attemptNumber = 1;

  while (true) {
    try {
      return await operation(attemptNumber);
    } catch (error) {
      const canRetry = attemptNumber < attempts && (options.shouldRetry?.(error, attemptNumber) ?? true);
      if (!canRetry) {
        throw error;
      }

      const delayMs = Math.min(maxDelayMs, Math.round(initialDelayMs * factor ** (attemptNumber - 1)));
      options.onRetry?.(error, attemptNumber, delayMs);
      await sleep(delayMs);
      attemptNumber += 1;
    }
  }
};
