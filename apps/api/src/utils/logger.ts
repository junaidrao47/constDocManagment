/**
 * Application logger.
 *
 * Still console-backed — a structured logger with request correlation is Phase 6
 * work, and swapping the implementation later only touches this file because
 * everything already logs through it.
 *
 * Under NODE_ENV=test, info and debug are dropped. Warnings and errors are kept:
 * those are the lines that explain a failing test, whereas the informational ones
 * (one per login, one per document status change) only bury it.
 */
const quiet = process.env.NODE_ENV === "test";

function noop(): void {
  // Intentionally does nothing.
}

export const logger = {
  info: quiet ? noop : console.log,
  warn: console.warn,
  error: console.error,
  debug: quiet ? noop : console.debug,
};
