import { UsageEventModel } from "./usage-event.model";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";

export const recordUsageEvent = async (
  metric: string,
  quantity = 1,
  metadata?: Record<string, unknown>
): Promise<void> => {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    return;
  }

  await UsageEventModel.create({
    tenantId,
    metric,
    quantity,
    metadata
  });
};
