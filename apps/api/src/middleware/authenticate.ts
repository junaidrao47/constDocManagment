import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env";
import { isTokenStale, loadSessionState, SessionState } from "../modules/auth/session";
import { TOKEN_TYPE_ACCESS, TokenClaims } from "../modules/auth/token";
import { UserRole } from "../modules/users/user.entity";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/** One shape for every rejection, so nothing here hints at why a token failed. */
function deny(res: Response, message = "Invalid token"): void {
  res.status(401).json({ success: false, error: message });
}

/**
 * Verifies the bearer token and attaches the caller to the request.
 *
 * Three checks, in order, each closing a specific hole:
 *
 *   1. signature and expiry — the token was issued by us and is still in date;
 *   2. `typ === "access"` — the token was issued *as a session credential*. Without
 *      this, any other JWT signed with JWT_SECRET works as a login;
 *   3. current user row — the account still exists, is still active, and the token
 *      predates no invalidation event. The role is then taken from the database,
 *      not from the token, so a demotion takes effect on the next request instead
 *      of when the token happens to expire.
 *
 * Step 3 costs a Redis hit, and a database read only when that cache is cold.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const [scheme, token] = header?.split(" ") ?? [];

  if (!token || scheme?.toLowerCase() !== "bearer") {
    deny(res, "No token");
    return;
  }

  let payload: JwtPayload & Partial<TokenClaims>;

  try {
    // env.jwtSecret is validated at boot, so a verify failure here is a genuinely
    // bad token rather than a missing-secret misconfiguration masquerading as one.
    payload = jwt.verify(token, env.jwtSecret) as JwtPayload & Partial<TokenClaims>;
  } catch {
    deny(res);
    return;
  }

  if (payload.typ !== TOKEN_TYPE_ACCESS || !payload.id) {
    deny(res);
    return;
  }

  // Initialised to null rather than declared bare, so the assignment inside the try
  // below does not leave TypeScript reasoning about definite assignment across a
  // catch clause.
  let state: SessionState | null = null;

  try {
    state = await loadSessionState(payload.id);
  } catch {
    // The account cannot be confirmed, so the request is refused rather than
    // admitted on the strength of a token alone.
    res.status(503).json({ success: false, error: "Authentication is temporarily unavailable" });
    return;
  }

  if (!state || !state.isActive || isTokenStale(payload.iat, state)) {
    deny(res, "Session is no longer valid");
    return;
  }

  req.user = {
    id: state.id,
    email: state.email,
    role: state.role,
  };

  next();
}
