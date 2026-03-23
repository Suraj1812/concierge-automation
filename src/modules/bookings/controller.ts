import { Request, Response } from "express";
import { BookingService } from "./service";

export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  list = async (_request: Request, response: Response): Promise<void> => {
    const data = await this.bookingService.list();
    response.status(200).json({ success: true, data });
  };

  update = async (request: Request, response: Response): Promise<void> => {
    const data = await this.bookingService.update(String(request.params.bookingId), request.body);
    response.status(200).json({ success: true, data });
  };
}
