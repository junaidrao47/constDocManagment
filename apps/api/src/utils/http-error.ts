/**
 * The API's one error type.
 *
 * Every failure the client is allowed to see is an `AppError`, which carries three
 * things the error handler needs: a stable string `code` the frontend can branch on
 * and localise, the HTTP status to send, and a developer-facing English `message`
 * that is safe to show (it never contains SQL, a stack, or internal names). An
 * optional `details` holds per-field validation errors.
 *
 * `HttpError(status, message)` is kept as a thin subclass so the ~115 existing call
 * sites that only know an HTTP status keep working unchanged: the status is mapped
 * to a sensible default code via STATUS_TO_CODE. A throw site that wants a precise
 * code (INVALID_STATUS_TRANSITION, NOTE_REQUIRED, ...) uses `AppError` directly.
 */

/** Default code for an HTTP status when a throw site does not name one. */
export const STATUS_TO_CODE: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "FILE_TOO_LARGE",
  415: "FILE_TYPE_NOT_ALLOWED",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

/** Falls back to INTERNAL_ERROR so an unmapped status never produces an empty code. */
export function codeForStatus(status: number): string {
  return STATUS_TO_CODE[status] ?? "INTERNAL_ERROR";
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly httpStatus: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Status-first error, retained for the many call sites that predate string codes.
 *
 * It is an `AppError` whose code is derived from the status, so the error handler
 * treats both identically and `instanceof AppError` matches it.
 */
export class HttpError extends AppError {
  constructor(statusCode: number, message: string, details?: unknown) {
    super(codeForStatus(statusCode), statusCode, message, details);
    this.name = "HttpError";
  }

  /** Kept so existing `error.statusCode` reads continue to compile and work. */
  get statusCode(): number {
    return this.httpStatus;
  }
}
