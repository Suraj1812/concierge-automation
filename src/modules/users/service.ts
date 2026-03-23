import { CustomerRepository } from "./repository";
import { Customer } from "./customer.model";

export class CustomerService {
  constructor(private readonly customerRepository: CustomerRepository) {}

  async upsertFromWhatsApp(payload: {
    phone: string;
    name?: string;
    whatsappUserId?: string;
  }): Promise<Customer> {
    return this.customerRepository.upsertByPhone(payload.phone, {
      name: payload.name,
      whatsappUserId: payload.whatsappUserId
    });
  }

  async getById(customerId: string): Promise<Customer | null> {
    return this.customerRepository.findById(customerId);
  }

  async updateMemory(customerId: string, summary: string, preferences?: Partial<Customer["preferences"]>): Promise<void> {
    await this.customerRepository.appendMemory(customerId, summary, "ai");
    await this.customerRepository.updateMemorySummary(customerId, summary, preferences);
  }
}
