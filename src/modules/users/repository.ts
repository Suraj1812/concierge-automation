import { Customer, CustomerModel } from "./customer.model";

export class CustomerRepository {
  async findByPhone(phone: string): Promise<Customer | null> {
    return CustomerModel.findOne({ phone }).lean();
  }

  async findByEmail(email: string): Promise<Customer | null> {
    return CustomerModel.findOne({ email: email.toLowerCase() }).lean();
  }

  async findById(id: string): Promise<Customer | null> {
    return CustomerModel.findById(id).lean();
  }

  async upsertByPhone(phone: string, payload: Partial<Customer>): Promise<Customer> {
    const document = await CustomerModel.findOneAndUpdate(
      { phone },
      {
        $set: {
          ...payload,
          phone,
          lastSeenAt: new Date()
        }
      },
      { new: true, upsert: true }
    );
    return document.toObject();
  }

  async upsertByEmail(email: string, payload: Partial<Customer>): Promise<Customer> {
    const document = await CustomerModel.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: {
          ...payload,
          email: email.toLowerCase(),
          lastSeenAt: new Date()
        }
      },
      { new: true, upsert: true }
    );

    return document.toObject();
  }

  async appendMemory(customerId: string, summary: string, source: "ai" | "ops" | "system"): Promise<void> {
    await CustomerModel.findByIdAndUpdate(customerId, {
      $push: {
        memoryEvents: {
          summary,
          source,
          createdAt: new Date()
        }
      }
    });
  }

  async updateMemorySummary(customerId: string, memorySummary: string, preferences?: Partial<Customer["preferences"]>): Promise<void> {
    const preferencePatch = Object.fromEntries(
      Object.entries(preferences ?? {}).map(([key, value]) => [`preferences.${key}`, value])
    );

    await CustomerModel.findByIdAndUpdate(customerId, {
      $set: {
        memorySummary,
        ...preferencePatch
      }
    });
  }
}
