import { Request, Response } from "express";
import { EnquiryService } from "./service";

export class EnquiryController {
  constructor(private readonly enquiryService: EnquiryService) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.enquiryService.list();
    response.status(200).json({ success: true, data });
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const data = await this.enquiryService.getById(String(request.params.enquiryId));
    response.status(200).json({ success: true, data });
  };
}
