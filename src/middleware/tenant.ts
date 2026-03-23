import { NextFunction, Request, Response } from "express";
import { AppError } from "../common/errors/AppError";
import { tenantService } from "../container";
import { runWithTenantContext } from "../infrastructure/tenancy/tenant-context";

const attachTenantToRequest = async (request: Request, tenantId?: string, tenantSlug?: string): Promise<void> => {
  const tenant = tenantId
    ? await tenantService.resolveById(tenantId)
    : await tenantService.resolveBySlug(tenantSlug);

  request.tenant = {
    id: String((tenant as unknown as { _id?: unknown })._id || (tenant as unknown as { id?: string }).id),
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    featureFlags: { ...tenant.featureFlags }
  };
};

export const attachAdminTenantContext = async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
  if (!request.admin?.tenantId) {
    next(new AppError("Tenant context missing from authentication token", 401, "TENANT_CONTEXT_MISSING"));
    return;
  }

  await attachTenantToRequest(request, request.admin.tenantId);
  const tenant = request.tenant;
  if (!tenant) {
    next(new AppError("Tenant could not be resolved for the authenticated admin", 401, "TENANT_NOT_FOUND"));
    return;
  }

  await runWithTenantContext(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug
    },
    async () => next()
  );
};

export const attachPublicTenantContext = async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
  const slugHeader = request.headers["x-tenant-slug"];
  const slugParam = Array.isArray(request.params.tenantSlug) ? request.params.tenantSlug[0] : request.params.tenantSlug;
  const slug = slugParam || (Array.isArray(slugHeader) ? slugHeader[0] : slugHeader);
  await attachTenantToRequest(request, undefined, slug);
  const tenant = request.tenant;
  if (!tenant) {
    next(new AppError("Tenant could not be resolved for the incoming request", 404, "TENANT_NOT_FOUND"));
    return;
  }

  await runWithTenantContext(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug
    },
    async () => next()
  );
};
