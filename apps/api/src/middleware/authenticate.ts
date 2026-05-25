import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({ success: false, error: "No token" });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET ?? "";
    const payload = jwt.verify(token, secret) as AuthenticatedUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}
