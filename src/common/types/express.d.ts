declare namespace Express {
  interface Request {
    rawBody?: Buffer;
    correlationId?: string;
    admin?: {
      id: string;
      email: string;
      role: string;
    };
  }
}
