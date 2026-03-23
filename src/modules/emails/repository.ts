import { EmailMessage, EmailMessageModel } from "./email-message.model";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class EmailMessageRepository {
  async create(payload: EmailMessage): Promise<EmailMessage> {
    const document = await EmailMessageModel.create(attachTenantPayload(payload as unknown as Record<string, unknown>));
    return document.toObject();
  }

  async list(limit = 50): Promise<EmailMessage[]> {
    return EmailMessageModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  }
}
