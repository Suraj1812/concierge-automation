export const getTenantIdFromEntity = (entity: unknown): string | undefined => {
  if (!entity || typeof entity !== "object") {
    return undefined;
  }

  const tenantId = (entity as { tenantId?: unknown }).tenantId;
  if (!tenantId) {
    return undefined;
  }

  if (typeof tenantId === "string") {
    return tenantId;
  }

  if (typeof tenantId === "object" && typeof (tenantId as { toString?: () => string }).toString === "function") {
    return (tenantId as { toString: () => string }).toString();
  }

  return undefined;
};
