import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http-error";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(statusCode).json({ success: false, error: message, code: statusCode });
}
