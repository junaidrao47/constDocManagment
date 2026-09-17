import bcrypt from "bcryptjs";
import { closeDatabase, initializeDatabase } from "../config/database";
import { UserEntity, UserRole } from "../modules/users/user.entity";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Platform Administrator";

if (!email || !password || password.length < 8 || password.length > 72) {
  throw new Error("Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (8-72 characters).");
}

const bootstrapPassword = password;

async function main() {
  const dataSource = await initializeDatabase();
  const repository = dataSource.getRepository(UserEntity);
  const existing = await repository.findOne({ where: { email } });

  if (existing) {
    if (existing.role !== UserRole.Admin) {
      throw new Error(`Account ${email} already exists with role ${existing.role}; refusing to promote it automatically.`);
    }

    console.log(`Admin already exists: ${email}`);
    return;
  }

  const user = repository.create({
    email,
    passwordHash: await bcrypt.hash(bootstrapPassword, 12),
    name,
    role: UserRole.Admin,
    isActive: true,
  });
  await repository.save(user);
  console.log(`Created admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(`[admin:create] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });