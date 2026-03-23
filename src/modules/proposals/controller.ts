import { Request, Response } from "express";
import { ProposalService } from "./service";

export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  generate = async (request: Request, response: Response): Promise<void> => {
    const data = await this.proposalService.generateForEnquiry(String(request.body.enquiryId));
    response.status(201).json({ success: true, data });
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const data = await this.proposalService.getById(String(request.params.proposalId));
    response.status(200).json({ success: true, data });
  };
}
