import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { UserEntity } from "./user.entity";

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  email?: string;
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

    return serializeUser(await userRepository.save(user));
  },

  serializeUser,
};export function createUser() {
  return null;
}
