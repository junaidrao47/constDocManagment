import crypto from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Gives every request a stable id for tracing.
 *
 * An inbound `x-request-id` is honoured so a trace can span the proxy and the
 * frontends, but only when it is a sane token. An attacker-controlled value is
 * otherwise echoed into our logs and error bodies, which is a log-forging and
 * header-injection vector; anything that fails the check is replaced with a fresh
 * UUID rather than rejected, so a malformed header never turns into a failed
 * request. The id is put on the request, returned in the response header, and read
 * by the error handler into every error body and log line.
 *
 * Mounted before the body parser so that even a malformed-JSON 400 carries an id.
 */

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers["x-request-id"];
  const candidate = Array.isArray(provided) ? provided[0] : provided;

  req.requestId = candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);

  next();
}
