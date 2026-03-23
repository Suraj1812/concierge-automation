import { AsyncLocalStorage } from "node:async_hooks";

export type TenantExecutionContext = {
  tenantId: string;
  tenantSlug?: string;
};

const storage = new AsyncLocalStorage<TenantExecutionContext>();

export const runWithTenantContext = async <T>(
  context: TenantExecutionContext,
  callback: () => Promise<T> | T
): Promise<T> =>
  storage.run(context, callback);

export const getTenantContext = (): TenantExecutionContext | undefined => storage.getStore();

export const getCurrentTenantId = (): string | undefined => storage.getStore()?.tenantId;
