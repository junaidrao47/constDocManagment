import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { QueryFailedError } from "typeorm";
import { HttpError } from "../utils/http-error";
import { logger } from "../utils/logger";

/**
 * The single exit for every failure.
 *
 * The previous version returned `error.message` for anything that reached it,
 * including unexpected errors. That leaked internals to the client: a Postgres
 * failure would hand back constraint and column names, and a thrown driver error
 * described the schema. AGENT.md rule 6 says not to expose sensitive metadata, and
 * a stack of unfamiliar internal detail is exactly that.
 *
 * So the rule is: errors we raised on purpose (`HttpError`) carry a message written
 * for the caller and are returned as-is. Everything else is a bug or an outage —
 * the client gets a generic message plus a reference id, and the real detail goes
 * to the log where that id can be found.
 */

interface ErrorBody {
  success: false;
  error: string;
  code: number;
  reference?: string;
}

/** Postgres puts its SQLSTATE on the driver error; TypeORM copies it onto the wrapper
 * in some versions and not others, so both places are checked. */
function postgresCode(error: QueryFailedError): string | undefined {
  const own = (error as unknown as { code?: unknown }).code;

  if (typeof own === "string") {
    return own;
  }

  const driver = (error as unknown as { driverError?: { code?: unknown } }).driverError;

  return typeof driver?.code === "string" ? driver.code : undefined;
}

/** Maps errors thrown by libraries onto the status the caller should actually see. */
function classify(error: unknown): { statusCode: number; message: string } | null {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof TokenExpiredError) {
    return { statusCode: 401, message: "Token has expired" };
  }

  if (error instanceof JsonWebTokenError) {
    return { statusCode: 401, message: "Invalid token" };
  }

  // 23505 is unique_violation. Reported as a conflict, but without echoing the
  // constraint name, which would disclose how the tables are keyed.
  if (error instanceof QueryFailedError && postgresCode(error) === "23505") {
    return { statusCode: 409, message: "That value is already in use" };
  }

  if (error instanceof SyntaxError && "body" in error) {
    return { statusCode: 400, message: "Request body is not valid JSON" };
  }

  return null;
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  const classified = classify(error);

  if (classified) {
    // 4xx is the caller's problem and is expected traffic; logged at warn without a
    // stack so that a wave of failed logins does not bury real faults.
    if (classified.statusCode >= 500) {
      logger.error(`[error] ${req.method} ${req.originalUrl} -> ${classified.statusCode}: ${classified.message}`);
    } else {
      logger.warn(`[error] ${req.method} ${req.originalUrl} -> ${classified.statusCode}: ${classified.message}`);
    }

    const body: ErrorBody = { success: false, error: classified.message, code: classified.statusCode };
    res.status(classified.statusCode).json(body);
    return;
  }

  // Unrecognised: assume it is a defect. The reference ties the opaque client
  // response to the full detail in the log.
  const reference = crypto.randomBytes(6).toString("hex");
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);

  logger.error(`[error] ${req.method} ${req.originalUrl} -> 500 [ref ${reference}]\n${detail}`);

  const body: ErrorBody = {
    success: false,
    error: "Internal server error",
    code: 500,
    reference,
  };

  res.status(500).json(body);
}
