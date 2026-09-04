import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";

/** Validates and replaces `req.body` with the parsed, coerced, normalised result. */
export function validate(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.flatten() });
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.flatten() });
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error.flatten() });
      return;
    }

    Object.defineProperty(req, "params", { value: result.data, writable: true, configurable: true });
    next();
  };
}
