import { NextFunction, Request, Response } from "express";
import { AppError } from "../common/errors/AppError";
import { getEntityId } from "../common/utils/entity";
import { tenantService } from "../container";
import { runWithTenantContext } from "../infrastructure/tenancy/tenant-context";
import { buildResolvedTenantConfig } from "../modules/tenants/runtime-config";
import type { TenantRecord } from "../modules/tenants/repository";

const attachTenantToRequest = async (request: Request, tenantId?: string, tenantSlug?: string): Promise<TenantRecord> => {
  const tenant = tenantId
    ? await tenantService.resolveById(tenantId)
    : await tenantService.resolveBySlug(tenantSlug);

  request.tenant = {
    id: getEntityId(tenant),
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    featureFlags: { ...tenant.featureFlags }
  };

  return tenant;
};

const attachAdminTenantContextHandler = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
  if (!request.admin?.tenantId) {
    next(new AppError("Tenant context missing from authentication token", 401, "TENANT_CONTEXT_MISSING"));
    return;
  }

  const tenantRecord = await attachTenantToRequest(request, request.admin.tenantId);
  const tenant = request.tenant;
  if (!tenant) {
    next(new AppError("Tenant could not be resolved for the authenticated admin", 401, "TENANT_NOT_FOUND"));
    return;
  }

  await runWithTenantContext(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      tenantConfig: buildResolvedTenantConfig(tenantRecord)
    },
    async () => next()
  );
};

const attachPublicTenantContextHandler = async (
  request: Request,
  _response: Response,
  next: NextFunction
): Promise<void> => {
  const slugHeader = request.headers["x-tenant-slug"];
  const slugParam = Array.isArray(request.params.tenantSlug) ? request.params.tenantSlug[0] : request.params.tenantSlug;
  const slug = slugParam || (Array.isArray(slugHeader) ? slugHeader[0] : slugHeader);
  const tenantRecord = await attachTenantToRequest(request, undefined, slug);
  const tenant = request.tenant;
  if (!tenant) {
    next(new AppError("Tenant could not be resolved for the incoming request", 404, "TENANT_NOT_FOUND"));
    return;
  }

  await runWithTenantContext(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      tenantConfig: buildResolvedTenantConfig(tenantRecord)
    },
    async () => next()
  );
};

export const attachAdminTenantContext = (request: Request, response: Response, next: NextFunction): void => {
  void attachAdminTenantContextHandler(request, response, next).catch(next);
};

export const attachPublicTenantContext = (request: Request, response: Response, next: NextFunction): void => {
  void attachPublicTenantContextHandler(request, response, next).catch(next);
};
