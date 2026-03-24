import { UsageEventModel } from "./usage-event.model";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";
import { logger } from "../../infrastructure/logging/logger";

export const recordUsageEvent = async (
  metric: string,
  quantity = 1,
  metadata?: Record<string, unknown>
): Promise<void> => {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    return;
  }

  void UsageEventModel.create({
    tenantId,
    metric,
    quantity,
    metadata
  }).catch((error: Error) => {
    logger.warn("Failed to record usage event", {
      tenantId,
      metric,
      error
    });
  });
};
