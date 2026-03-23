import { IdempotencyKeyModel, type IdempotencyKeyRecord } from "./idempotency-key.model";
import { getCurrentTenantId } from "../../infrastructure/tenancy/tenant-context";

export class IdempotencyKeyRepository {
  private buildScopedFilter(key: string): Record<string, unknown> {
    const tenantId = getCurrentTenantId();
    return tenantId ? { tenantId, key } : { key };
  }

  async findByKey(key: string): Promise<IdempotencyKeyRecord | null> {
    return IdempotencyKeyModel.findOne(this.buildScopedFilter(key)).lean();
  }

  async startProcessing(payload: {
    key: string;
    route: string;
    method: string;
    requestHash: string;
    expiresAt: Date;
    lockTtlMs: number;
  }): Promise<{ outcome: "started" | "replay" | "in_progress"; record?: IdempotencyKeyRecord }> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + payload.lockTtlMs);
    const tenantId = getCurrentTenantId();
    const existing = await this.findByKey(payload.key);

    if (existing) {
      if (existing.status === "completed") {
        return { outcome: "replay", record: existing };
      }

      if (existing.lockExpiresAt && existing.lockExpiresAt > now) {
        return { outcome: "in_progress", record: existing };
      }
    }

    try {
      const document = await IdempotencyKeyModel.create({
        ...(tenantId ? { tenantId } : {}),
        key: payload.key,
        route: payload.route,
        method: payload.method,
        requestHash: payload.requestHash,
        status: "in_progress",
        processingStartedAt: now,
        lockExpiresAt,
        expiresAt: payload.expiresAt
      });

      return {
        outcome: "started",
        record: document.toObject()
      };
    } catch (error) {
      const duplicateKeyErrorCode = 11000;
      if ((error as { code?: number }).code !== duplicateKeyErrorCode) {
        throw error;
      }
    }

    const current = await this.findByKey(payload.key);
    if (!current) {
      return { outcome: "in_progress" };
    }

    if (current.status === "completed") {
      return { outcome: "replay", record: current };
    }

    if (current.lockExpiresAt && current.lockExpiresAt > now) {
      return { outcome: "in_progress", record: current };
    }

    const reclaimed = await IdempotencyKeyModel.findOneAndUpdate(
      {
        ...this.buildScopedFilter(payload.key),
        requestHash: payload.requestHash,
        $or: [
          { status: "failed" },
          { status: "in_progress", lockExpiresAt: { $lte: now } }
        ]
      },
      {
        $set: {
          route: payload.route,
          method: payload.method,
          status: "in_progress",
          processingStartedAt: now,
          lockExpiresAt,
          lastError: undefined,
          expiresAt: payload.expiresAt
        },
        $unset: {
          responseStatus: "",
          responseBody: ""
        }
      },
      { new: true }
    ).lean();

    return reclaimed ? { outcome: "started", record: reclaimed } : { outcome: "in_progress", record: current };
  }

  async complete(key: string, responseStatus: number, responseBody: Record<string, unknown>): Promise<void> {
    await IdempotencyKeyModel.updateOne(
      this.buildScopedFilter(key),
      {
        $set: {
          status: "completed",
          responseStatus,
          responseBody,
          lastError: undefined
        },
        $unset: {
          lockExpiresAt: "",
          processingStartedAt: ""
        }
      }
    );
  }

  async fail(key: string, errorMessage: string): Promise<void> {
    await IdempotencyKeyModel.updateOne(
      this.buildScopedFilter(key),
      {
        $set: {
          status: "failed",
          lastError: errorMessage
        },
        $unset: {
          lockExpiresAt: "",
          processingStartedAt: ""
        }
      }
    );
  }
}
