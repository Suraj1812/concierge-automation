import { Request } from "express";
import { AuditRepository } from "./repository";

export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async record(payload: {
    actorType: "admin" | "customer" | "system" | "vendor";
    actorId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    request?: Request;
  }): Promise<void> {
    await this.auditRepository.create({
      actorType: payload.actorType,
      actorId: payload.actorId,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      metadata: payload.metadata,
      ipAddress: payload.request?.ip,
      userAgent: payload.request?.headers["user-agent"],
      correlationId: payload.request?.correlationId
    });
  }

  async list(limit?: number) {
    return this.auditRepository.list(limit);
  }
}
