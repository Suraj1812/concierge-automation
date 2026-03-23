import { Request, Response } from "express";
import { VendorService } from "./service";

export class VendorController {
  constructor(private readonly vendorService: VendorService) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.vendorService.list();
    response.status(200).json({ success: true, data });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const data = await this.vendorService.create(request.body);
    response.status(201).json({ success: true, data });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const data = await this.vendorService.update(String(request.params.vendorId), request.body);
    response.status(200).json({ success: true, data });
  };
}
