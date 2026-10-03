import { closeDatabase, initializeDatabase, AppDataSource } from "../config/database";

async function reset() {
  if (process.env.PHASE0_ALLOW_DESTRUCTIVE_RESET !== "1") throw new Error("Set PHASE0_ALLOW_DESTRUCTIVE_RESET=1 to reset the Phase 0 database");
  await initializeDatabase();
  await AppDataSource.query(`TRUNCATE TABLE "quotation_status_history", "quotation_items", "quotations", "documents", "document_status_history", "payments", "invoices", "subscriptions", "notifications_log", "refresh_tokens", "package_services", "packages", "services", "worker_ranges", "locations", "industries", "users" RESTART IDENTITY CASCADE`);
  console.log("Phase 0 database reset complete.");
}

reset().catch((error) => { console.error("[phase0:reset] failed", error); process.exitCode = 1; }).finally(() => closeDatabase());