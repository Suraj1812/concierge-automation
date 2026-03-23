import { Request, Response } from "express";
import { AuditService } from "./service";

export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    const limit = Number(request.query.limit ?? 100);
    const data = await this.auditService.list(limit);
    response.status(200).json({ success: true, data });
  };
}
