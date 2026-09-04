import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { MoreThan } from "typeorm";
import { AppDataSource } from "../../config/database";
import { env } from "../../config/env";
import { redisClient } from "../../config/redis";
import { HttpError } from "../../utils/http-error";
import { logger } from "../../utils/logger";
import { sendEmail } from "../../utils/email";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import { UserEntity, UserRole } from "../users/user.entity";
import {
  consumePasswordResetToken,
  invalidateAllSessions,
  issuePasswordResetToken,
  PASSWORD_RESET_TTL_MS,
} from "./session";
import { TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH, TokenClaims } from "./token";

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  role?: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RefreshInput {
  refreshToken: string;
}

export interface LogoutInput {
  refreshToken?: string | null;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

/**
 * Where the password-reset link points.
 *
 * WEB_URL when set, otherwise the first configured CORS origin, since that is the
 * browser app in every deployment we control. Never derived from the request's
 * Host or Origin header: an attacker-supplied header would put an attacker-chosen
 * domain into an email the victim has every reason to trust.
 */
function resolveWebUrl(): string | null {
  if (env.webUrl) {
    return env.webUrl.replace(/\/+$/, "");
  }

  const firstOrigin = env.corsOrigin?.split(",")[0]?.trim();

  return firstOrigin && firstOrigin !== "*" ? firstOrigin.replace(/\/+$/, "") : null;
}

// Sourced from the validated env module, which guarantees both signing keys are
// present and long enough before the process finishes booting.
const ACCESS_TOKEN_EXPIRES_IN = env.jwtExpiresIn;
const REFRESH_TOKEN_EXPIRES_IN = env.jwtRefreshExpiresIn;

function durationToMs(duration: string): number {
  const match = duration.trim().match(/^(\d+)([smhd])$/i);

  if (!match) {
    throw new HttpError(500, `Invalid duration value: ${duration}`);
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factor: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return amount * factor[unit];
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function sanitizeUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    phone: user.phone ?? null,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function signAccessToken(user: UserEntity): string {
  const payload: TokenClaims = {
    id: user.id,
    email: user.email,
    role: user.role,
    typ: TOKEN_TYPE_ACCESS,
  };

  const secret = env.jwtSecret;
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secret, options);
}

function signRefreshToken(user: UserEntity): { refreshToken: string; tokenId: string } {
  const tokenId = crypto.randomUUID();
  const payload: TokenClaims = {
    id: user.id,
    email: user.email,
    role: user.role,
    typ: TOKEN_TYPE_REFRESH,
  };

  const secret = env.jwtRefreshSecret;
  const options: SignOptions = {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
    jwtid: tokenId,
  };

  return {
    tokenId,
    refreshToken: jwt.sign(payload, secret, options),
  };
}

async function persistRefreshToken(userId: string, tokenId: string, refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const expiresInMs = durationToMs(REFRESH_TOKEN_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + expiresInMs);

  await AppDataSource.getRepository(RefreshTokenEntity).save({
    userId,
    tokenHash,
    expiresAt,
    revoked: false,
  });

  await redisClient.set(`refresh-token:${tokenId}`, tokenHash, "PX", expiresInMs);
}

async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const refreshSecret = env.jwtRefreshSecret;
  const decoded = jwt.verify(refreshToken, refreshSecret) as JwtPayload & { jti?: string };
  const tokenId = decoded.jti;
  const tokenHash = hashToken(refreshToken);

  if (tokenId) {
    await redisClient.del(`refresh-token:${tokenId}`);
  }

  await AppDataSource.getRepository(RefreshTokenEntity).update(
    { tokenHash },
    {
      revoked: true,
    },
  );
}

async function buildAuthResponse(user: UserEntity): Promise<{ user: ReturnType<typeof sanitizeUser>; accessToken: string; refreshToken: string }> {
  const { tokenId, refreshToken } = signRefreshToken(user);
  const accessToken = signAccessToken(user);

  await persistRefreshToken(user.id, tokenId, refreshToken);

  return {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
  };
}

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

export const authService = {
  async register(input: RegisterInput) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const existingUser = await userRepository.findOne({ where: { email: input.email } });

    if (existingUser) {
      throw new HttpError(409, "Email already exists");
    }

    const user = userRepository.create({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role ?? UserRole.Customer,
      name: input.name ?? null,
      phone: input.phone ?? null,
      isActive: true,
    });

    const savedUser = await userRepository.save(user);
    return buildAuthResponse(savedUser);
  },

  async login(input: LoginInput) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { email: input.email } });

    if (!user) {
      throw new HttpError(401, "Invalid credentials");
    }

    if (!user.isActive) {
      throw new HttpError(403, "User account is disabled");
    }

    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new HttpError(401, "Invalid credentials");
    }

    return buildAuthResponse(user);
  },

  async refresh(input: RefreshInput) {
    assertDatabaseReady();

    const refreshSecret = env.jwtRefreshSecret;
    const decoded = jwt.verify(input.refreshToken, refreshSecret) as JwtPayload & Partial<TokenClaims>;
    const tokenId = decoded.jti;

    // A token signed with the refresh key but minted for another purpose is not a
    // refresh token. Checked explicitly so adding a third token type later cannot
    // quietly make it exchangeable for a session.
    if (!tokenId || decoded.typ !== TOKEN_TYPE_REFRESH || !decoded.id) {
      throw new HttpError(401, "Invalid refresh token");
    }

    const tokenHash = hashToken(input.refreshToken);
    const cachedHash = await redisClient.get(`refresh-token:${tokenId}`);

    if (cachedHash !== tokenHash) {
      const refreshTokenRepository = AppDataSource.getRepository(RefreshTokenEntity);
      const tokenRecord = await refreshTokenRepository.findOne({
        where: {
          tokenHash,
          revoked: false,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (!tokenRecord) {
        throw new HttpError(401, "Refresh token revoked or expired");
      }
    }

    // The Redis mirror above is a fast path that can outlive a bulk revocation, so
    // the account's own cut-off is checked regardless of which branch was taken.
    // This is what makes a password reset end sessions rather than only rotate the
    // password. Read from the row rather than the session cache, because the row is
    // needed anyway to mint the replacement pair.
    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { id: decoded.id } });

    if (!user || !user.isActive) {
      throw new HttpError(401, "User account is not available");
    }

    const validFromSec = user.tokensValidFrom ? Math.floor(user.tokensValidFrom.getTime() / 1000) : 0;

    if (validFromSec && (decoded.iat === undefined || decoded.iat < validFromSec)) {
      throw new HttpError(401, "Refresh token revoked or expired");
    }

    await revokeRefreshToken(input.refreshToken);
    const authResponse = await buildAuthResponse(user);

    return {
      accessToken: authResponse.accessToken,
      refreshToken: authResponse.refreshToken,
      user: authResponse.user,
    };
  },

  async logout(input: LogoutInput) {
    assertDatabaseReady();

    if (!input.refreshToken) {
      throw new HttpError(400, "refreshToken is required");
    }

    try {
      await revokeRefreshToken(input.refreshToken);
    } catch {
      // Logout is idempotent by design. A token that is expired, malformed, or
      // already revoked means the session is gone, which is the caller's goal —
      // reporting failure would only tempt clients to keep credentials around.
      return { revoked: true };
    }

    return { revoked: true };
  },

  /**
   * Starts a password reset.
   *
   * Returns the same payload for every syntactically valid email address. The
   * previous version threw 404 for unknown addresses, which turned this endpoint
   * into a membership oracle: anyone could enumerate which emails hold accounts.
   * It also returned the reset token in the response body, so knowing an address
   * was enough to take over the account — and because that token was signed with
   * JWT_SECRET it doubled as a bearer token for the whole API.
   *
   * Now the token is opaque, stored server-side, and only ever leaves the process
   * inside the email.
   */
  async forgotPassword(input: ForgotPasswordInput) {
    assertDatabaseReady();

    const uniformResponse = {
      sent: true,
      message: "If an account exists for that email, a reset link has been sent.",
    };

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { email: input.email } });

    // Unknown address, or a disabled account: same response, no email, no token.
    if (!user || !user.isActive) {
      logger.info(`[auth] password reset requested for an unusable address`);
      return uniformResponse;
    }

    const resetToken = await issuePasswordResetToken(user.id);
    const webUrl = resolveWebUrl();
    const resetLink = webUrl
      ? `${webUrl}/reset-password?token=${encodeURIComponent(resetToken)}`
      : null;
    const validForMinutes = Math.round(PASSWORD_RESET_TTL_MS / 60_000);

    const body = [
      `A password reset was requested for your account.`,
      ``,
      resetLink
        ? `Open this link to choose a new password:\n${resetLink}`
        : `Use this reset token in the app:\n${resetToken}`,
      ``,
      `The link expires in ${validForMinutes} minutes and can be used once.`,
      `If you did not request this, no action is needed — your password has not changed.`,
    ].join("\n");

    // Delivery is best-effort on purpose: if it failed the caller must still get
    // the response above, or the difference would reopen the enumeration oracle.
    const { delivered, transport } = await sendEmail({
      to: user.email,
      subject: "Reset your password",
      text: body,
    });

    if (!delivered) {
      logger.warn(`[auth] reset email for user ${user.id} was not delivered (transport: ${transport})`);
    }

    return uniformResponse;
  },

  /**
   * Completes a password reset.
   *
   * The token is consumed atomically, so a link works exactly once, and every
   * existing session is torn down afterwards — including any access token an
   * attacker may already hold, which revoking refresh tokens alone would leave
   * live for the remainder of its 15 minutes.
   */
  async resetPassword(input: ResetPasswordInput) {
    assertDatabaseReady();

    const userId = await consumePasswordResetToken(input.token);

    if (!userId) {
      throw new HttpError(400, "Reset token is invalid or has expired");
    }

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user || !user.isActive) {
      throw new HttpError(400, "Reset token is invalid or has expired");
    }

    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    await userRepository.save(user);

    await invalidateAllSessions(user.id);

    logger.info(`[auth] password reset completed for user ${user.id}; all sessions revoked`);

    return { reset: true };
  },
};
