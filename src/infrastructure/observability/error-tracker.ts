import { logger } from "../logging/logger";
import { metrics } from "./metrics";

export const errorTracker = {
  captureException(error: Error, context?: Record<string, unknown>): void {
    metrics.increment("application_errors_total", {
      type: error.name || "Error"
    });

    logger.error("Captured application exception", {
      error,
      ...context
    });
  }
};
