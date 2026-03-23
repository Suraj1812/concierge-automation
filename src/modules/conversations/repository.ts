import { Types } from "mongoose";
import { Conversation, ConversationModel, ConversationMessage } from "./conversation.model";
import { ConversationState } from "../../common/types/domain";
import { attachTenantPayload } from "../../infrastructure/tenancy/attach-tenant-payload";

export class ConversationRepository {
  async findById(id: string): Promise<Conversation | null> {
    return ConversationModel.findById(id).lean();
  }

  async findActiveByCustomer(customerId: string): Promise<Conversation | null> {
    return ConversationModel.findOne({
      customerId: new Types.ObjectId(customerId),
      status: "active"
    })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async create(customerId: string, enquiryId?: string): Promise<Conversation> {
    const document = await ConversationModel.create(attachTenantPayload({
      customerId: new Types.ObjectId(customerId),
      enquiryId: enquiryId ? new Types.ObjectId(enquiryId) : undefined,
      channel: "whatsapp",
      state: "collecting_requirements",
      history: [],
      pendingClarifications: []
    }));
    return document.toObject();
  }

  async appendMessage(conversationId: string, message: ConversationMessage): Promise<void> {
    const update: Record<string, unknown> = {
      $push: { history: message }
    };

    if (message.direction === "inbound") {
      update.$set = { lastInboundAt: message.sentAt };
    }

    if (message.direction === "outbound") {
      update.$set = { lastOutboundAt: message.sentAt };
    }

    await ConversationModel.findByIdAndUpdate(conversationId, update);
  }

  async updateState(conversationId: string, state: ConversationState, pendingClarifications: string[], contextSnapshot?: string): Promise<void> {
    await ConversationModel.findByIdAndUpdate(conversationId, {
      $set: {
        state,
        pendingClarifications,
        ...(contextSnapshot ? { contextSnapshot } : {})
      }
    });
  }

  async attachEnquiry(conversationId: string, enquiryId: string): Promise<void> {
    await ConversationModel.findByIdAndUpdate(conversationId, {
      $set: {
        enquiryId: new Types.ObjectId(enquiryId)
      }
    });
  }

  async list(limit = 50): Promise<Conversation[]> {
    return ConversationModel.find().sort({ updatedAt: -1 }).limit(limit).lean();
  }
}
