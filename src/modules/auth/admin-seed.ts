import { authService } from "../../container";

export const seedAdminUser = async (): Promise<void> => {
  await authService.seedDefaultAdmin();
};
