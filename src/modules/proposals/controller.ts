import { Request, Response } from "express";
import { ProposalService } from "./service";

export class ProposalController {
  constructor(private readonly proposalService: ProposalService) {}

  generate = async (request: Request, response: Response): Promise<void> => {
    const data = await this.proposalService.generateForEnquiry(String(request.body.enquiryId));
    response.status(data ? 201 : 202).json({
      success: true,
      data,
      message: data ? "Proposal generated successfully" : "Proposal generation deferred until vendor collection is complete"
    });
  };

  getById = async (request: Request, response: Response): Promise<void> => {
    const data = await this.proposalService.getById(String(request.params.proposalId));
    response.status(200).json({ success: true, data });
  };

  downloadDocument = async (request: Request, response: Response): Promise<void> => {
    const document = await this.proposalService.getDocumentForSharing(
      String(request.params.proposalId),
      String(request.query.token)
    );

    response.setHeader("Cache-Control", "private, no-store, max-age=0");
    response.setHeader("Content-Type", "application/pdf");
    response.sendFile(document.filePath);
  };
}
