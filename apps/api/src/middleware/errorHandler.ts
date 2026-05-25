import { NextFunction, Request, Response } from "express";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({ success: false, error: message, code: 500 });
}
