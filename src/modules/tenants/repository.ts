import { Tenant, TenantModel } from "./tenant.model";

export type TenantRecord = Tenant & {
  _id?: unknown;
  id?: string;
};

type TenantCacheEntry = {
  tenant: TenantRecord;
  expiresAt: number;
};

type TenantSlugCacheEntry = {
  tenantId: string;
  expiresAt: number;
};

const TENANT_CACHE_TTL_MS = 30_000;
const tenantByIdCache = new Map<string, TenantCacheEntry>();
const tenantIdBySlugCache = new Map<string, TenantSlugCacheEntry>();

const normalizeSlug = (slug: string): string => slug.toLowerCase();

const getTenantId = (tenant: TenantRecord | null | undefined): string | undefined => {
  if (!tenant) {
    return undefined;
  }

  const rawId = tenant._id ?? tenant.id;
  return rawId ? String(rawId) : undefined;
};

const removeTenantCacheEntry = (tenantId: string): void => {
  const entry = tenantByIdCache.get(tenantId);
  if (entry) {
    tenantIdBySlugCache.delete(normalizeSlug(entry.tenant.slug));
  }

  tenantByIdCache.delete(tenantId);
};

const getCachedTenantById = (tenantId: string): TenantRecord | null => {
  const cached = tenantByIdCache.get(tenantId);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    removeTenantCacheEntry(tenantId);
    return null;
  }

  return cached.tenant;
};

const rememberTenant = <T extends TenantRecord>(tenant: T): T => {
  const tenantId = getTenantId(tenant);
  if (!tenantId) {
    return tenant;
  }

  tenantByIdCache.set(tenantId, {
    tenant,
    expiresAt: Date.now() + TENANT_CACHE_TTL_MS
  });
  tenantIdBySlugCache.set(normalizeSlug(tenant.slug), {
    tenantId,
    expiresAt: Date.now() + TENANT_CACHE_TTL_MS
  });
  return tenant;
};

export const invalidateTenantCache = (payload: { tenantId?: string; tenantSlug?: string }): void => {
  if (payload.tenantId) {
    removeTenantCacheEntry(payload.tenantId);
  }

  if (payload.tenantSlug) {
    const normalizedSlug = normalizeSlug(payload.tenantSlug);
    const tenantCacheEntry = tenantIdBySlugCache.get(normalizedSlug);
    if (tenantCacheEntry) {
      removeTenantCacheEntry(tenantCacheEntry.tenantId);
    }

    tenantIdBySlugCache.delete(normalizedSlug);
  }
};

export class TenantRepository {
  async create(payload: Tenant): Promise<TenantRecord> {
    const document = await TenantModel.create(payload);
    return rememberTenant(document.toObject());
  }

  async list(): Promise<Tenant[]> {
    return TenantModel.find().sort({ createdAt: -1 }).lean();
  }

  async findById(id: string): Promise<TenantRecord | null> {
    const cached = getCachedTenantById(id);
    if (cached) {
      return cached;
    }

    const tenant = await TenantModel.findById(id).lean();
    return tenant ? rememberTenant(tenant as TenantRecord) : null;
  }

  async findBySlug(slug: string): Promise<TenantRecord | null> {
    const normalizedSlug = normalizeSlug(slug);
    const cachedTenantEntry = tenantIdBySlugCache.get(normalizedSlug);
    if (cachedTenantEntry) {
      if (cachedTenantEntry.expiresAt <= Date.now()) {
        tenantIdBySlugCache.delete(normalizedSlug);
      } else {
        const cached = getCachedTenantById(cachedTenantEntry.tenantId);
        if (cached) {
          return cached;
        }

        tenantIdBySlugCache.delete(normalizedSlug);
      }
    }

    const tenant = await TenantModel.findOne({ slug: normalizedSlug }).lean();
    return tenant ? rememberTenant(tenant as TenantRecord) : null;
  }

  async update(id: string, payload: Partial<Tenant>): Promise<TenantRecord | null> {
    const existing = await this.findById(id);
    const document = await TenantModel.findByIdAndUpdate(id, { $set: payload }, { new: true }).lean();

    invalidateTenantCache({
      tenantId: id,
      tenantSlug: existing?.slug
    });

    return document ? rememberTenant(document as TenantRecord) : null;
  }
}
