import { AsyncLocalStorage } from "node:async_hooks";
import type { ResolvedTenantConfig } from "../../modules/tenants/runtime-config";

export type TenantExecutionContext = {
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
  tenantConfig?: ResolvedTenantConfig;
};

const storage = new AsyncLocalStorage<TenantExecutionContext>();

export const runWithTenantContext = async <T>(
  context: TenantExecutionContext,
  callback: () => Promise<T> | T
): Promise<T> =>
  storage.run(context, callback);

export const getTenantContext = (): TenantExecutionContext | undefined => storage.getStore();

export const getCurrentTenantId = (): string | undefined => storage.getStore()?.tenantId;
