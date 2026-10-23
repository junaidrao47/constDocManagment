import { NextFunction, Request, Response } from "express";
import { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import { QueryFailedError } from "typeorm";
import { ZodError } from "zod";
import { AppError } from "../utils/http-error";
import { logger } from "../utils/logger";

/**
 * The single exit for every failure.
 *
 * Every non-2xx response leaves here in one shape:
 *
 *   { success: false, error: { code, message, details?, requestId } }
 *
 * `code` is a stable string the frontend branches on and localises; `message` is
 * English, for developers and logs, and is only ever text we wrote. Errors we
 * raised on purpose (`AppError`, and `HttpError` which extends it) carry all three.
 * Library errors are mapped to a code below. Anything unrecognised is treated as a
 * defect: the client gets a generic INTERNAL_ERROR and the requestId, while the
 * stack goes to the log under that id. No stack, SQL, or internal name is ever put
 * in the body, in any environment — AGENT.md rule 6.
 */

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

interface Classified {
  code: string;
  httpStatus: number;
  message: string;
  details?: unknown;
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

/** Maps a thrown value onto the code, status and safe message the caller should see. */
function classify(error: unknown): Classified {
  if (error instanceof AppError) {
    return { code: error.code, httpStatus: error.httpStatus, message: error.message, details: error.details };
  }

  // A ZodError that was thrown rather than handled in `validate` middleware.
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_FAILED",
      httpStatus: 400,
      message: error.issues[0]?.message ?? "Validation failed",
      details: error.flatten().fieldErrors,
    };
  }

  if (error instanceof TokenExpiredError) {
    return { code: "UNAUTHENTICATED", httpStatus: 401, message: "Token has expired" };
  }

  if (error instanceof JsonWebTokenError) {
    return { code: "UNAUTHENTICATED", httpStatus: 401, message: "Invalid token" };
  }

  // 23505 is unique_violation. Reported as a conflict, but without echoing the
  // constraint name, which would disclose how the tables are keyed.
  if (error instanceof QueryFailedError && postgresCode(error) === "23505") {
    return { code: "CONFLICT", httpStatus: 409, message: "That value is already in use" };
  }

  if (error instanceof SyntaxError && "body" in error) {
    return { code: "MALFORMED_JSON", httpStatus: 400, message: "Request body is not valid JSON" };
  }

  // Unrecognised: assume it is a defect. A generic body; the real detail is logged.
  return { code: "INTERNAL_ERROR", httpStatus: 500, message: "Internal server error" };
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    return;
  }

  const { code, httpStatus, message, details } = classify(error);
  const requestId = req.requestId;

  // 5xx is a fault and is logged with its stack; 4xx is expected caller traffic and
  // is logged at warn without a stack, so a wave of failed logins does not bury a
  // real outage. The requestId ties the log line to the client's error body.
  if (httpStatus >= 500) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.error(`[error] [${requestId}] ${req.method} ${req.originalUrl} -> ${httpStatus} ${code}\n${detail}`);
  } else {
    logger.warn(`[error] [${requestId}] ${req.method} ${req.originalUrl} -> ${httpStatus} ${code}: ${message}`);
  }

  const body: ErrorEnvelope = { success: false, error: { code, message, requestId } };

  if (details !== undefined) {
    body.error.details = details;
  }

  res.status(httpStatus).json(body);
}
