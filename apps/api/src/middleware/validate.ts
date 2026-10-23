import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { AppError } from "../utils/http-error";

/**
 * Turns a Zod failure into the API's VALIDATION_FAILED envelope.
 *
 * Handed to `next` rather than written to `res` directly, so the single error
 * handler owns the response shape and the requestId. `details` carries the
 * per-field errors the frontend shows inline; the top-level message is the first
 * issue, for a caller that only reads the summary.
 */
function validationError(error: import("zod").ZodError): AppError {
  const message = error.issues[0]?.message ?? "Validation failed";
  return new AppError("VALIDATION_FAILED", 400, message, error.flatten().fieldErrors);
}

/** Validates and replaces `req.body` with the parsed, coerced, normalised result. */
export function validate(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(validationError(result.error));
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Same contract for the query string.
 *
 * Query values arrive as strings, so schemas used here need `z.coerce` for numbers
 * and booleans. Kept separate from `validate` rather than made a mode of it, so a
 * route reads as validating one specific part of the request.
 */
export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      next(validationError(result.error));
      return;
    }

    // Express 4 lets req.query be reassigned; Express 5 makes it a getter, so this
    // is written as a property definition to survive that upgrade.
    Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
    next();
  };
}

/** Rejects a path parameter that is not a UUID before it reaches a repository. */
export function validateParams(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      next(validationError(result.error));
      return;
    }

    Object.defineProperty(req, "params", { value: result.data, writable: true, configurable: true });
    next();
  };
}
