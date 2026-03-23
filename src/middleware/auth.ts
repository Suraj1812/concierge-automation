import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../common/errors/AppError";

type JwtPayload = {
  sub: string;
  email: string;
  role: string;
};

export const requireAdminAuth = (request: Request, _response: Response, next: NextFunction): void => {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    next(new AppError("Authentication token missing", 401, "UNAUTHORIZED"));
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    request.admin = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch {
    next(new AppError("Invalid or expired token", 401, "UNAUTHORIZED"));
  }
};
