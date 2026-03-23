import { Query, Schema, Types } from "mongoose";
import { getCurrentTenantId } from "./tenant-context";

const shouldSkipTenantEnforcement = (query: Query<unknown, unknown>): boolean => {
  const options = query.getOptions() as Record<string, unknown>;
  return options.skipTenantScope === true;
};

const applyTenantFilter = (query: Query<unknown, unknown>): void => {
  if (shouldSkipTenantEnforcement(query)) {
    return;
  }

  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    return;
  }

  const existingFilter = query.getFilter() as Record<string, unknown>;
  if (existingFilter.tenantId) {
    return;
  }

  query.setQuery({
    ...existingFilter,
    tenantId: new Types.ObjectId(tenantId)
  });
};

export const tenantScopedPlugin = <T>(schema: Schema<T>): void => {
  schema.add({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true }
  } as never);

  const ensureTenantId = function ensureTenantId(
    this: { tenantId?: Types.ObjectId },
    next: (error?: Error) => void
  ): void {
    if ((this as { tenantId?: Types.ObjectId }).tenantId) {
      next();
      return;
    }

    const tenantId = getCurrentTenantId();
    if (tenantId) {
      (this as { tenantId?: Types.ObjectId }).tenantId = new Types.ObjectId(tenantId);
    }

    next();
  };

  schema.pre("validate", ensureTenantId);
  schema.pre("save", ensureTenantId);

  schema.pre(["find", "findOne", "countDocuments", "findOneAndUpdate", "updateOne", "updateMany", "deleteOne", "deleteMany"], function tenantScopePreHook(next) {
    applyTenantFilter(this as Query<unknown, unknown>);

    const query = this as Query<unknown, unknown>;
    if (query.getOptions().upsert) {
      const tenantId = getCurrentTenantId();
      if (tenantId) {
        query.setUpdate({
          ...(query.getUpdate() as Record<string, unknown>),
          $setOnInsert: {
            ...(((query.getUpdate() as Record<string, unknown>)?.$setOnInsert as Record<string, unknown> | undefined) ?? {}),
            tenantId: new Types.ObjectId(tenantId)
          }
        });
      }
    }

    next();
  });

  schema.pre("aggregate", function tenantAggregatePreHook(next) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      next();
      return;
    }

    const pipeline = this.pipeline();
    const firstStage = pipeline[0] as unknown as Record<string, unknown> | undefined;
    if (firstStage?.$match && (firstStage.$match as Record<string, unknown>).tenantId) {
      next();
      return;
    }

    this.pipeline().unshift({
      $match: {
        tenantId: new Types.ObjectId(tenantId)
      }
    });

    next();
  });
};
