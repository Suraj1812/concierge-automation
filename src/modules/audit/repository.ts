import { AuditLog, AuditLogModel } from "./audit-log.model";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class AuditRepository {
  async create(payload: AuditLog): Promise<AuditLog> {
    const document = await AuditLogModel.create(attachTenantPayload(payload));
    return document.toObject();
  }

  async list(limit = 100): Promise<AuditLog[]> {
    return AuditLogModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }
}
