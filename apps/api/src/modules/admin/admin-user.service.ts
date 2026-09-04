import bcrypt from "bcryptjs";
import { FindOptionsWhere, ILike } from "typeorm";
import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { logger } from "../../utils/logger";
import { invalidateAllSessions, invalidateSessionCache } from "../auth/session";
import { UserEntity, UserRole } from "../users/user.entity";

/**
 * Admin user management.
 *
 * This is the only path by which an agent, manager, or admin account can exist:
 * `POST /api/auth/register` pins the role to `customer`, so before this endpoint
 * every staff account had to be created with a manual INSERT.
 *
 * Two rules run through all of it. Any change to `role` or `is_active` must reach
 * live sessions immediately — a stateless access token would otherwise carry the
 * old permissions until it expired. And no response may include a password hash.
 */

export interface ListUsersQuery {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export interface CreateUserInput {
  email: string;
  password: string;
  role: UserRole;
  name?: string;
  phone?: string;
}

export interface UpdateUserInput {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

/** Explicit allow-list, so a column added later is not exposed by accident. */
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

async function findUserOr404(id: string): Promise<UserEntity> {
  const user = await AppDataSource.getRepository(UserEntity).findOne({ where: { id } });

  if (!user) {
    throw new HttpError(404, "User not found");
  }

  return user;
}

export const adminUserService = {
  async listUsers(query: ListUsersQuery) {
    assertDatabaseReady();

    const where: FindOptionsWhere<UserEntity> = {};

    if (query.role) {
      where.role = query.role;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // ILike on email only. Matching name as well would need an OR, which means two
    // where-branches and duplicated filters; not worth it until the UI asks.
    if (query.search) {
      where.email = ILike(`%${query.search}%`);
    }

    const [users, total] = await AppDataSource.getRepository(UserEntity).findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items: users.map(serializeUser),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },

  async getUser(id: string) {
    assertDatabaseReady();
    return serializeUser(await findUserOr404(id));
  },

  async createUser(input: CreateUserInput, actorId: string) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const existing = await userRepository.findOne({ where: { email: input.email } });

    if (existing) {
      throw new HttpError(409, "Email already exists");
    }

    const user = userRepository.create({
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 12),
      role: input.role,
      name: input.name ?? null,
      phone: input.phone ?? null,
      isActive: true,
    });

    const saved = await userRepository.save(user);

    // Worth a log line at info: creating a privileged account is exactly the event
    // an audit would look for, and the notification/audit fabric lands in Phase 2.
    logger.info(`[admin] user ${actorId} created ${saved.role} account ${saved.id}`);

    return serializeUser(saved);
  },

  async updateUser(id: string, input: UpdateUserInput, actorId: string) {
    assertDatabaseReady();

    const userRepository = AppDataSource.getRepository(UserEntity);
    const user = await findUserOr404(id);

    // Removing your own admin rights, or disabling your own account, locks you out
    // and may leave no admin at all. Refused rather than warned about.
    const isSelf = user.id === actorId;
    const losingOwnAdmin = isSelf && input.role !== undefined && input.role !== UserRole.Admin;
    const disablingSelf = isSelf && input.isActive === false;

    if (losingOwnAdmin || disablingSelf) {
      throw new HttpError(400, "An admin cannot remove their own access");
    }

    if (input.email && input.email !== user.email) {
      const existing = await userRepository.findOne({ where: { email: input.email } });

      if (existing) {
        throw new HttpError(409, "Email already exists");
      }

      user.email = input.email;
    }

    const roleChanged = input.role !== undefined && input.role !== user.role;
    const activeChanged = input.isActive !== undefined && input.isActive !== user.isActive;

    if (input.role !== undefined) {
      user.role = input.role;
    }

    if (input.isActive !== undefined) {
      user.isActive = input.isActive;
    }

    const saved = await userRepository.save(user);

    if (roleChanged || activeChanged) {
      // A demotion or a deactivation has to end the sessions that were opened under
      // the old permissions, not merely stop new ones being opened.
      await invalidateAllSessions(saved.id);
      logger.info(
        `[admin] user ${actorId} changed account ${saved.id} ` +
          `(role=${saved.role}, active=${saved.isActive}); sessions revoked`,
      );
    } else {
      await invalidateSessionCache(saved.id);
    }

    return serializeUser(saved);
  },

  /** Narrow endpoint for the common activate/deactivate action. */
  async setUserStatus(id: string, isActive: boolean, actorId: string) {
    return adminUserService.updateUser(id, { isActive }, actorId);
  },
};
