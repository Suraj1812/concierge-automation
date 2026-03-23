import { Request, Response } from "express";
import { AuthService } from "./service";

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  login = async (request: Request, response: Response): Promise<void> => {
    const { email, password, tenantSlug } = request.body;
    const data = await this.authService.login(email, password, tenantSlug);

    response.status(200).json({
      success: true,
      data
    });
  };
}
