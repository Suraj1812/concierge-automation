import { IdempotencyKeyModel, type IdempotencyKeyRecord } from "./idempotency-key.model";

export class IdempotencyKeyRepository {
  async findByKey(key: string): Promise<IdempotencyKeyRecord | null> {
    return IdempotencyKeyModel.findOne({ key }).lean();
  }

  async create(payload: IdempotencyKeyRecord): Promise<void> {
    await IdempotencyKeyModel.create(payload);
  }
}
