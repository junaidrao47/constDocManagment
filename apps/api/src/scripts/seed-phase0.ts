import bcrypt from "bcryptjs";
import { closeDatabase, initializeDatabase, AppDataSource } from "../config/database";
import { IndustryEntity } from "../entities/industry.entity";
import { LocationEntity } from "../entities/location.entity";
import { ServiceEntity } from "../entities/service.entity";
import { WorkerRangeEntity } from "../entities/worker-range.entity";
import { PackageEntity } from "../modules/packages/package.entity";
import { QuotationEntity } from "../modules/quotations/quotation.entity";
import { UserEntity, UserRole } from "../modules/users/user.entity";

export const PHASE0_PASSWORDS = {
  admin: "AdminPassword123!",
  manager: "ManagerPassword123!",
  agent: "AgentPassword123!",
  customer: "CustomerPassword123!",
} as const;

async function upsertUser(email: string, name: string, role: UserRole, password: string) {
  const repository = AppDataSource.getRepository(UserEntity);
  let user = await repository.findOne({ where: { email } });
  if (!user) user = repository.create({ email });
  user.name = name;
  user.role = role;
  user.isActive = true;
  user.passwordHash = await bcrypt.hash(password, 12);
  return repository.save(user);
}

async function seed() {
  await initializeDatabase();
  const userRepository = AppDataSource.getRepository(UserEntity);
  const admin = await upsertUser("admin@test.com", "Phase 0 Administrator", UserRole.Admin, PHASE0_PASSWORDS.admin);
  await upsertUser("manager@test.com", "Phase 0 Manager", UserRole.Manager, PHASE0_PASSWORDS.manager);
  await upsertUser("agent@test.com", "Phase 0 Agent", UserRole.Agent, PHASE0_PASSWORDS.agent);
  const customer = await upsertUser("customer@test.com", "Phase 0 Customer", UserRole.Customer, PHASE0_PASSWORDS.customer);

  const serviceRepository = AppDataSource.getRepository(ServiceEntity);
  const documentService = await serviceRepository.save(serviceRepository.create({ name: "Construction Compliance Review", description: "Review and organize project compliance documents.", basePrice: "25000", isActive: true }));
  const safetyService = await serviceRepository.findOne({ where: { name: "Site Safety Documentation" } }) ?? await serviceRepository.save(serviceRepository.create({ name: "Site Safety Documentation", description: "Prepare and review site safety records.", basePrice: "18000", isActive: true }));

  const industryRepository = AppDataSource.getRepository(IndustryEntity);
  const industry = await industryRepository.findOne({ where: { name: "Construction" } }) ?? await industryRepository.save(industryRepository.create({ name: "Construction", description: "General construction and contracting." }));
  const locationRepository = AppDataSource.getRepository(LocationEntity);
  const location = await locationRepository.findOne({ where: { state: "Punjab", city: "Lahore" } }) ?? await locationRepository.save(locationRepository.create({ state: "Punjab", city: "Lahore", multiplier: "1.00", cityFee: "2500", isActive: true }));
  const workerRepository = AppDataSource.getRepository(WorkerRangeEntity);
  for (const range of [{ minWorkers: 1, maxWorkers: 10, basePrice: "15000" }, { minWorkers: 11, maxWorkers: 50, basePrice: "30000" }, { minWorkers: 51, maxWorkers: null, basePrice: "60000" }]) {
    const existing = range.maxWorkers === null
      ? await workerRepository.findOne({ where: { minWorkers: range.minWorkers } })
      : await workerRepository.findOne({ where: { minWorkers: range.minWorkers, maxWorkers: range.maxWorkers } });
    if (existing) { existing.basePrice = range.basePrice; existing.isActive = true; await workerRepository.save(existing); }
    else await workerRepository.save(workerRepository.create({ ...range, isActive: true }));
  }

  const packageRepository = AppDataSource.getRepository(PackageEntity);
  let packageEntity = await packageRepository.findOne({ where: { name: "Core Compliance Package" }, relations: { services: true } });
  if (!packageEntity) packageEntity = packageRepository.create({ name: "Core Compliance Package", type: "compliance", price: "40000", durationDays: 30 });
  packageEntity.type = "compliance";
  packageEntity.price = "40000";
  packageEntity.durationDays = 30;
  packageEntity.services = [documentService, safetyService];
  await packageRepository.save(packageEntity);

  const quotationRepository = AppDataSource.getRepository(QuotationEntity);
  const quotation = await quotationRepository.findOne({ where: { customerId: customer.id, industryId: industry.id, locationId: location.id, status: "draft" } });
  if (!quotation) await quotationRepository.save(quotationRepository.create({ customerId: customer.id, industryId: industry.id, locationId: location.id, workerCount: 10, totalPrice: "48000", status: "draft", expiresAt: new Date(Date.now() + 30 * 86_400_000) }));

  console.log(JSON.stringify({ admin: admin.email, users: { manager: "manager@test.com", agent: "agent@test.com", customer: "customer@test.com" }, passwords: PHASE0_PASSWORDS, services: [documentService.name, safetyService.name], package: packageEntity.name }, null, 2));
}

seed().catch((error) => { console.error("[phase0:seed] failed", error); process.exitCode = 1; }).finally(() => closeDatabase());