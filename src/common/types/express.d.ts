declare namespace Express {
  interface Request {
    rawBody?: Buffer;
    correlationId?: string;
    admin?: {
      id: string;
      email: string;
      role: string;
      tenantId: string;
    };
    tenant?: {
      id: string;
      slug: string;
      name: string;
      status: string;
      featureFlags: Record<string, boolean>;
    };
  }
}
