import { UserRole } from "../users/user.entity";

/**
 * The `typ` claim, and why it exists.
 *
 * Access tokens are signed with JWT_SECRET and refresh tokens with
 * JWT_REFRESH_SECRET, which on its own looks like enough separation. It is not:
 * anything else that ever signs with JWT_SECRET produces a token that
 * `authenticate` will happily accept as a session. That is exactly how the old
 * password-reset token became a working bearer credential.
 *
 * Tagging every token with its intended purpose and checking the tag at each
 * verification point makes that class of confusion impossible to reintroduce,
 * including for tokens added later.
 */
export const TOKEN_TYPE_ACCESS = "access";
export const TOKEN_TYPE_REFRESH = "refresh";

export type TokenType = typeof TOKEN_TYPE_ACCESS | typeof TOKEN_TYPE_REFRESH;

/** Claims carried by both token types, beyond the registered ones jsonwebtoken adds. */
export interface TokenClaims {
  id: string;
  email: string;
  role: UserRole;
  typ: TokenType;
}
