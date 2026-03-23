import { Request, Response } from "express";
import { ConversationService } from "./service";

export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.conversationService.list();
    response.status(200).json({ success: true, data });
  };
}
