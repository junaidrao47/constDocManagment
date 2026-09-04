import bcrypt from "bcryptjs";
import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { invalidateSessionCache } from "../auth/session";
import { UserEntity } from "./user.entity";

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  email?: string;
  currentPassword?: string;
}

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function serializeUser(user: UserEntity) {
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

export const userService = {
  async getCurrentUser(userId: string) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    return serializeUser(user);
  },

  async updateCurrentUser(userId: string, input: UpdateProfileInput) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    if (input.email && input.email !== user.email) {
      // Re-authenticate before letting the account's identity move. The zod schema
      // already requires the field; this is the check that it is correct.
      const passwordMatches = input.currentPassword
        ? await bcrypt.compare(input.currentPassword, user.passwordHash)
        : false;

      if (!passwordMatches) {
        throw new HttpError(401, "Current password is incorrect");
      }

      const existingUser = await userRepository.findOne({ where: { email: input.email } });
      if (existingUser) {
        throw new HttpError(409, "Email already exists");
      }

      user.email = input.email;
    }

    if (input.name !== undefined) {
      user.name = input.name;
    }

    if (input.phone !== undefined) {
      user.phone = input.phone;
    }

    const saved = await userRepository.save(user);

    // The session cache holds the email, so a stale entry would keep serving the
    // old address on every authenticated request until the TTL expired.
    await invalidateSessionCache(saved.id);

    return serializeUser(saved);
  },

  serializeUser,
};
