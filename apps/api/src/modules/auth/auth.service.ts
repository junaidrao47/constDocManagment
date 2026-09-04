import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { MoreThan } from "typeorm";
import { AppDataSource } from "../../config/database";
import { env } from "../../config/env";
import { redisClient } from "../../config/redis";
import { HttpError } from "../../utils/http-error";
import { RefreshTokenEntity } from "../../entities/refresh-token.entity";
import { UserEntity, UserRole } from "../users/user.entity";

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

interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
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
  const payload: AuthUser = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const secret = env.jwtSecret;
  const options: SignOptions = {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
  };

  return jwt.sign(payload, secret, options);
}

function signRefreshToken(user: UserEntity): { refreshToken: string; tokenId: string } {
  const tokenId = crypto.randomUUID();
  const payload: AuthUser = {
    id: user.id,
    email: user.email,
    role: user.role,
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
    const decoded = jwt.verify(input.refreshToken, refreshSecret) as JwtPayload & AuthUser;
    const tokenId = decoded.jti;

    if (!tokenId) {
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

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { id: decoded.id } });

    if (!user || !user.isActive) {
      throw new HttpError(401, "User account is not available");
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

    await revokeRefreshToken(input.refreshToken);
    return { revoked: true };
  },

  async forgotPassword(input: ForgotPasswordInput) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { email: input.email } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    const resetToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        purpose: "password-reset",
      },
      env.jwtSecret,
      {
        expiresIn: "15m",
      },
    );

    return { sent: true, resetToken };
  },

  async resetPassword(input: ResetPasswordInput) {
    assertDatabaseReady();

    const decoded = jwt.verify(input.token, env.jwtSecret) as JwtPayload & {
      id?: string;
      purpose?: string;
    };

    if (decoded.purpose !== "password-reset" || !decoded.id) {
      throw new HttpError(401, "Invalid reset token");
    }

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { id: decoded.id } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    user.passwordHash = await bcrypt.hash(input.newPassword, 12);
    await userRepository.save(user);

    return { reset: true };
  },
};
