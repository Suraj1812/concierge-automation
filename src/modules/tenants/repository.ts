import { Tenant, TenantModel } from "./tenant.model";

export class TenantRepository {
  async create(payload: Tenant): Promise<Tenant> {
    const document = await TenantModel.create(payload);
    return document.toObject();
  }

  async list(): Promise<Tenant[]> {
    return TenantModel.find().sort({ createdAt: -1 }).lean();
  }

  async findById(id: string): Promise<Tenant | null> {
    return TenantModel.findById(id).lean();
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return TenantModel.findOne({ slug: slug.toLowerCase() }).lean();
  }

  async update(id: string, payload: Partial<Tenant>): Promise<Tenant | null> {
    const document = await TenantModel.findByIdAndUpdate(id, { $set: payload }, { new: true });
    return document?.toObject() ?? null;
  }
}
