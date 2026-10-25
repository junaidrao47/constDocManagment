/**
 * Remove ALL demo data created by scripts/seed-demo.ts (W1).
 *
 * Deletes in one transaction, child-before-parent, keyed off the `is_demo` flag on the root
 * tables (users, categories, services, packages, documents, quotations, invoices, payments,
 * subscriptions, the two assignment tables) and the FK of each dependent/child table back to a
 * flagged parent. Non-demo data (seed-phase0, real rows) is never touched because only demo rows
 * carry the flag and demo child rows only ever reference demo parents.
 *
 * Safety: refuses to run when NODE_ENV=production unless ALLOW_DEMO_SEED=true.
 */
import { closeDatabase, initializeDatabase, AppDataSource } from "../config/database";

// Ordered so every row is deleted before anything it points at. `label` is for the report.
const STEPS: Array<{ label: string; sql: string }> = [
  { label: "payments", sql: `DELETE FROM "payments" WHERE "is_demo" = true` },
  { label: "invoices", sql: `DELETE FROM "invoices" WHERE "is_demo" = true` },
  { label: "quotation_items", sql: `DELETE FROM "quotation_items" WHERE "quotation_id" IN (SELECT "id" FROM "quotations" WHERE "is_demo" = true)` },
  { label: "quotation_status_history", sql: `DELETE FROM "quotation_status_history" WHERE "quotation_id" IN (SELECT "id" FROM "quotations" WHERE "is_demo" = true)` },
  { label: "quotations", sql: `DELETE FROM "quotations" WHERE "is_demo" = true` },
  { label: "document_phase_history", sql: `DELETE FROM "document_phase_history" WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "is_demo" = true)` },
  { label: "document_phases", sql: `DELETE FROM "document_phases" WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "is_demo" = true)` },
  { label: "document_status_history", sql: `DELETE FROM "document_status_history" WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "is_demo" = true)` },
  { label: "documents.current_version_id=NULL", sql: `UPDATE "documents" SET "current_version_id" = NULL WHERE "is_demo" = true` },
  { label: "document_versions", sql: `DELETE FROM "document_versions" WHERE "document_id" IN (SELECT "id" FROM "documents" WHERE "is_demo" = true)` },
  { label: "documents", sql: `DELETE FROM "documents" WHERE "is_demo" = true` },
  { label: "subscriptions", sql: `DELETE FROM "subscriptions" WHERE "is_demo" = true` },
  { label: "customer_manager_assignment_log", sql: `DELETE FROM "customer_manager_assignment_log" WHERE "customer_id" IN (SELECT "id" FROM "users" WHERE "is_demo" = true)` },
  { label: "customer_manager_assignments", sql: `DELETE FROM "customer_manager_assignments" WHERE "is_demo" = true` },
  { label: "agent_customer_assignments", sql: `DELETE FROM "agent_customer_assignments" WHERE "is_demo" = true` },
  { label: "customer_profiles", sql: `DELETE FROM "customer_profiles" WHERE "customer_id" IN (SELECT "id" FROM "users" WHERE "is_demo" = true)` },
  { label: "notifications_log", sql: `DELETE FROM "notifications_log" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "is_demo" = true)` },
  { label: "refresh_tokens", sql: `DELETE FROM "refresh_tokens" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "is_demo" = true)` },
  { label: "package_services", sql: `DELETE FROM "package_services" WHERE "package_id" IN (SELECT "id" FROM "packages" WHERE "is_demo" = true) OR "service_id" IN (SELECT "id" FROM "services" WHERE "is_demo" = true)` },
  { label: "service_required_documents", sql: `DELETE FROM "service_required_documents" WHERE "service_id" IN (SELECT "id" FROM "services" WHERE "is_demo" = true)` },
  { label: "packages", sql: `DELETE FROM "packages" WHERE "is_demo" = true` },
  { label: "services", sql: `DELETE FROM "services" WHERE "is_demo" = true` },
  { label: "categories", sql: `DELETE FROM "categories" WHERE "is_demo" = true` },
  { label: "users", sql: `DELETE FROM "users" WHERE "is_demo" = true` },
];

async function purge() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to purge in production. Set ALLOW_DEMO_SEED=true to override.");
  }
  await initializeDatabase();
  const runner = AppDataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  const deleted: Record<string, number> = {};
  try {
    for (const step of STEPS) {
      const result = await runner.query(step.sql);
      // node-postgres returns [rows, affected]; TypeORM surfaces affected on result[1] for DELETE/UPDATE
      const affected = Array.isArray(result) ? (result[1] ?? 0) : (result?.affected ?? 0);
      deleted[step.label] = Number(affected) || 0;
    }
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
  console.log(JSON.stringify({ ok: true, deleted }, null, 2));
}

purge()
  .catch((error) => { console.error("[purge-demo] failed", error); process.exitCode = 1; })
  .finally(() => closeDatabase());
