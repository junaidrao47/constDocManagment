import crypto from "crypto";
import { AppDataSource } from "../../config/database";
import { redisClient } from "../../config/redis";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import { UserEntity, UserRole } from "../users/user.entity";

/**
 * Session state: the part of authentication that cannot live inside a JWT.
 *
 * A signed access token is a snapshot of the user at login. Nothing in it changes
 * when an admin disables the account, demotes the role, or the user resets their
 * password — the token keeps working until it expires. With a 15-minute lifetime
 * that is a 15-minute window in which a fired employee still has their old access.
 *
 * So every authenticated request checks the user's current row. To keep that from
 * becoming a database read per request, the answer is cached in Redis for a few
 * seconds and invalidated explicitly whenever something mutates the user. The TTL
 * is the ceiling on staleness if an invalidation is ever missed; it is deliberately
 * short because "refused within seconds" is the requirement.
 */

/** Cache lifetime in milliseconds. Short enough to satisfy "within seconds". */
const SESSION_CACHE_TTL_MS = 30_000;

/** Cached when the user id does not exist, so a bad id cannot be a query amplifier. */
const MISSING_MARKER = "missing";

export interface SessionState {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  /** Epoch seconds; tokens issued before this are stale. 0 when never invalidated. */
  tokensValidFromSec: number;
}

function cacheKey(userId: string): string {
  return `session:${userId}`;
}

/**
 * Converts a Date to epoch *seconds*, rounding down.
 *
 * JWT `iat` has one-second resolution. Comparing it against a millisecond
 * timestamp would reject a token minted in the same second as the invalidation,
 * which breaks the legitimate "reset password, then log in immediately" path.
 * Truncating both sides to seconds means only tokens from a strictly earlier
 * second are refused.
 */
function toEpochSeconds(value: Date | null | undefined): number {
  return value ? Math.floor(value.getTime() / 1000) : 0;
}

/**
 * Returns the user's current authentication-relevant state, or null if the user no
 * longer exists. Reads through a short-lived Redis cache.
 *
 * A Redis failure must not lock everyone out, so cache errors fall through to the
 * database rather than propagating.
 */
export async function loadSessionState(userId: string): Promise<SessionState | null> {
  try {
    const cached = await redisClient.get(cacheKey(userId));

    if (cached === MISSING_MARKER) {
      return null;
    }

    if (cached) {
      return JSON.parse(cached) as SessionState;
    }
  } catch {
    // Cache unavailable — fall through to the database.
  }

  if (!AppDataSource.isInitialized) {
    return null;
  }

  const user = await AppDataSource.getRepository(UserEntity).findOne({
    where: { id: userId },
    select: ["id", "email", "role", "isActive", "tokensValidFrom"],
  });

  const state: SessionState | null = user
    ? {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        tokensValidFromSec: toEpochSeconds(user.tokensValidFrom),
      }
    : null;

  try {
    await redisClient.set(
      cacheKey(userId),
      state ? JSON.stringify(state) : MISSING_MARKER,
      "PX",
      SESSION_CACHE_TTL_MS,
    );
  } catch {
    // Caching is an optimisation; losing the write only costs a query next time.
  }

  return state;
}

/**
 * Drops the cached state for a user.
 *
 * Must be called by every code path that changes `role`, `is_active`, or
 * `tokens_valid_from`, otherwise the change is invisible for up to the cache TTL.
 */
export async function invalidateSessionCache(userId: string): Promise<void> {
  try {
    await redisClient.del(cacheKey(userId));
  } catch {
    // Worst case the change takes effect when the TTL expires instead.
  }
}

/** True when a token minted at `issuedAtSec` predates the user's invalidation cut-off. */
export function isTokenStale(issuedAtSec: number | undefined, state: SessionState): boolean {
  if (!state.tokensValidFromSec) {
    return false;
  }

  // A token with no `iat` cannot be placed in time, so treat it as stale.
  return issuedAtSec === undefined || issuedAtSec < state.tokensValidFromSec;
}

/**
 * Ends every existing session for a user: marks stored refresh tokens revoked and
 * moves the token cut-off to now, which also invalidates access tokens that are
 * still inside their 15-minute window.
 *
 * Callers: password reset, and admin changes to role or active status.
 */
export async function invalidateAllSessions(userId: string): Promise<void> {
  await AppDataSource.getRepository(RefreshTokenEntity).update({ userId, revoked: false }, { revoked: true });

  await AppDataSource.getRepository(UserEntity).update({ id: userId }, { tokensValidFrom: new Date() });

  await invalidateSessionCache(userId);
}

/**
 * One-time tokens held in Redis rather than signed as JWTs.
 *
 * A signed reset token verified with `JWT_SECRET` is indistinguishable from an
 * access token to anything that verifies with the same key, and it cannot be
 * withdrawn once issued. An opaque random value stored server-side is revocable by
 * construction, expires by TTL, and is consumed atomically so a link works once.
 *
 * Only the SHA-256 hash is stored: a dump of Redis then does not hand over usable
 * reset links, the same reasoning already applied to refresh tokens.
 */
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

function resetKey(tokenHash: string): string {
  return `password-reset:${tokenHash}`;
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Issues an opaque reset token and returns the raw value, which is never stored. */
export async function issuePasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  await redisClient.set(resetKey(hashOpaqueToken(token)), userId, "PX", PASSWORD_RESET_TTL_MS);
  return token;
}

/**
 * Redeems a reset token, returning the user id it was issued for, or null if it is
 * unknown, expired, or already used.
 *
 * The read and the delete run inside one MULTI so two concurrent requests carrying
 * the same token cannot both succeed — the reset link is single-use even under a
 * race, and this holds on any Redis version rather than needing GETDEL.
 */
export async function consumePasswordResetToken(token: string): Promise<string | null> {
  const key = resetKey(hashOpaqueToken(token));
  const results = await redisClient.multi().get(key).del(key).exec();
  const userId = results?.[0]?.[1];

  return typeof userId === "string" && userId.length > 0 ? userId : null;
}
