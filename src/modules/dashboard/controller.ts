import { Request, Response } from "express";
import { DashboardService } from "./service";

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  overview = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.dashboardService.getOverview();
    response.status(200).json({ success: true, data });
  };

  funnel = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.dashboardService.getFunnel();
    response.status(200).json({ success: true, data });
  };

  activity = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.dashboardService.getActivity();
    response.status(200).json({ success: true, data });
  };
}
