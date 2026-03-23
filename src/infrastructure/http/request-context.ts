import { NextFunction, Request, Response } from "express";
import { v4 as uuid } from "uuid";

export const attachRequestContext = (request: Request, response: Response, next: NextFunction): void => {
  request.correlationId = (request.headers["x-correlation-id"] as string) || uuid();
  response.setHeader("x-correlation-id", request.correlationId);
  next();
};
