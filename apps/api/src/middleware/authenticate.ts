import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

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
    // env.jwtSecret is validated at boot, so a verify failure here is a genuinely
    // bad token rather than a missing-secret misconfiguration masquerading as one.
    const payload = jwt.verify(token, env.jwtSecret) as AuthenticatedUser;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid token" });
  }
}
