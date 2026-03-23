import { getCurrentTenantId } from "./tenant-context";

export const attachTenantPayload = <T extends Record<string, unknown>>(payload: T): T | (T & { tenantId: string }) => {
  if ("tenantId" in payload) {
    return payload;
  }

  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    return payload;
  }

  return {
    ...payload,
    tenantId
  };
};
