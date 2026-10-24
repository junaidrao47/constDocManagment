import { AppDataSource } from "../../config/database";
import { redisClient } from "../../config/redis";
import { HttpError } from "../../utils/http-error";
import { logger } from "../../utils/logger";
import type { AnalyticsQuery } from "./admin-analytics.schema";

/**
 * Platform analytics overview (PROJECT-BRIEF §11.9).
 *
 * Every KPI is a single grouped SQL aggregate — no per-row queries — and the whole
 * payload is cached in Redis for 60s so a dashboard refresh does not re-run the
 * aggregates each time. `from`/`to` bound the time-series and revenue figures;
 * snapshot counts (by status) are always current.
 */

const CACHE_TTL_MS = 60_000;
const DEFAULT_RANGE_DAYS = 30;

const WAITING_DOCUMENT_STATUSES = ["pending", "under_review", "submitted_to_government", "rejected"];

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function resolveRange(query: AnalyticsQuery): { from: Date; to: Date } {
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
}

export const adminAnalyticsService = {
  async overview(query: AnalyticsQuery) {
    assertDatabaseReady();
    const { from, to } = resolveRange(query);

    const cacheKey = `analytics:overview:${from.toISOString()}:${to.toISOString()}`;
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Cache miss or Redis down — fall through and compute.
    }

    const [
      customersByStatus,
      registrations,
      documentsByStatus,
      phaseDuration,
      documentsWaiting,
      quotationsFunnel,
      revenue,
      emails,
    ] = await Promise.all([
      AppDataSource.query(
        `SELECT account_status AS status, COUNT(*)::int AS count
         FROM users WHERE role = 'customer' GROUP BY account_status`,
      ),
      AppDataSource.query(
        `SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count
         FROM users WHERE role = 'customer' AND created_at BETWEEN $1 AND $2
         GROUP BY day ORDER BY day`,
        [from, to],
      ),
      AppDataSource.query(
        `SELECT status, COUNT(*)::int AS count FROM documents GROUP BY status`,
      ),
      AppDataSource.query(
        `SELECT EXTRACT(EPOCH FROM AVG(completed_at - created_at)) AS avg_seconds
         FROM document_phases WHERE status = 'completed' AND completed_at IS NOT NULL`,
      ),
      AppDataSource.query(
        `SELECT a.manager_id AS "managerId", u.email AS "managerEmail", COUNT(*)::int AS waiting
         FROM documents d
         JOIN customer_manager_assignments a ON a.customer_id = d.customer_id
         JOIN users u ON u.id = a.manager_id
         WHERE d.status = ANY($1)
         GROUP BY a.manager_id, u.email ORDER BY waiting DESC`,
        [WAITING_DOCUMENT_STATUSES],
      ),
      AppDataSource.query(
        `SELECT status, COUNT(*)::int AS count FROM quotations GROUP BY status`,
      ),
      AppDataSource.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM invoices WHERE status = 'paid' AND paid_at BETWEEN $1 AND $2`,
        [from, to],
      ),
      AppDataSource.query(
        `SELECT status, COUNT(*)::int AS count
         FROM notifications_log WHERE channel = 'email' GROUP BY status`,
      ),
    ]);

    const payload = {
      range: { from: from.toISOString(), to: to.toISOString() },
      customersByStatus: customersByStatus.map((r: { status: string; count: number }) => ({ status: r.status, count: r.count })),
      registrationsOverTime: registrations.map((r: { day: string; count: number }) => ({ day: r.day, count: r.count })),
      documentsByStatus: documentsByStatus.map((r: { status: string; count: number }) => ({ status: r.status, count: r.count })),
      averagePhaseDurationSeconds: toNumber(phaseDuration[0]?.avg_seconds),
      documentsWaitingPerManager: documentsWaiting.map((r: { managerId: string; managerEmail: string; waiting: number }) => ({
        managerId: r.managerId,
        managerEmail: r.managerEmail,
        waiting: r.waiting,
      })),
      quotationsFunnel: quotationsFunnel.map((r: { status: string; count: number }) => ({ status: r.status, count: r.count })),
      revenue: { currency: "MXN", total: toNumber(revenue[0]?.total) },
      emails: emails.map((r: { status: string; count: number }) => ({ status: r.status, count: r.count })),
    };

    try {
      await redisClient.set(cacheKey, JSON.stringify(payload), "PX", CACHE_TTL_MS);
    } catch (error) {
      logger.warn(`[analytics] could not cache overview: ${error instanceof Error ? error.message : String(error)}`);
    }

    return payload;
  },
};
