import { Request, Response } from "express";
import { TenantService } from "./service";

export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.tenantService.list();
    response.status(200).json({ success: true, data });
  };

  current = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ success: true, data: request.tenant });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const data = await this.tenantService.create(request.body);
    response.status(201).json({ success: true, data });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const data = await this.tenantService.update(String(request.params.tenantId), request.body);
    response.status(200).json({ success: true, data });
  };
}
