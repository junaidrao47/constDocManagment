import { In } from "typeorm";
import { AppDataSource } from "../../config/database";
import { HttpError } from "../../utils/http-error";
import { DocumentStatusHistoryEntity } from "../../entities/document-status-history.entity";
import { assignmentService } from "../assignments/assignment.service";
import { customerService } from "../customers/customer.service";
import { DocumentEntity } from "../documents/document.entity";
import { DocumentPhaseEntity } from "../documents/document-phase.entity";
import { DocumentPhaseHistoryEntity } from "../documents/document-phase-history.entity";
import { computePhaseProgress } from "../documents/document.service";
import { SubscriptionEntity } from "../subscriptions/subscription.entity";
import { UserEntity, UserRole } from "../users/user.entity";

/**
 * Manager workspace reads (PROJECT-BRIEF §11.8): the "my customers" list and a
 * per-customer profile page. Admins may read any customer; a manager only their
 * own assigned customers. All aggregates are built from a handful of `In(...)`
 * queries rather than a query per customer/document.
 */

const WAITING_DOCUMENT_STATUSES = ["pending", "under_review", "submitted_to_government", "rejected"];

interface Actor {
  id: string;
  role: UserRole;
}

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

async function assertCanReadCustomer(actor: Actor, customerId: string): Promise<void> {
  if (actor.role === UserRole.Admin) return;
  if (actor.role === UserRole.Manager && (await assignmentService.isManagerFor(actor.id, customerId))) return;
  throw new HttpError(403, "Forbidden");
}

export const managerService = {
  /** The manager's customers, each with a pending-document count and phase progress. */
  async listCustomers(actor: Actor) {
    assertDatabaseReady();

    // Admin sees all customers assigned to any manager is not the intent here; the
    // workspace is "my customers", so an admin caller still scopes to themselves only
    // if they happen to be a manager. Admins use the admin surface for the full list.
    const ids = await assignmentService.listCustomersForManager(actor.id);
    if (ids.length === 0) return [];

    const [users, documents] = await Promise.all([
      AppDataSource.getRepository(UserEntity).find({ where: { id: In(ids) } }),
      AppDataSource.getRepository(DocumentEntity).find({ where: { customerId: In(ids) } }),
    ]);
    const docIds = documents.map((d) => d.id);
    const phases = docIds.length
      ? await AppDataSource.getRepository(DocumentPhaseEntity).find({ where: { documentId: In(docIds) } })
      : [];

    return users
      .map((user) => {
        const customerDocs = documents.filter((d) => d.customerId === user.id);
        const customerDocIds = new Set(customerDocs.map((d) => d.id));
        const customerPhases = phases.filter((p) => customerDocIds.has(p.documentId));
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          accountStatus: user.accountStatus,
          documentsCount: customerDocs.length,
          pendingDocuments: customerDocs.filter((d) => WAITING_DOCUMENT_STATUSES.includes(d.status)).length,
          progress: computePhaseProgress(customerPhases),
        };
      })
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  },

  /** A customer's full profile: onboarding, subscriptions, documents + progress, timeline. */
  async getCustomer(actor: Actor, customerId: string) {
    assertDatabaseReady();
    await assertCanReadCustomer(actor, customerId);

    const user = await AppDataSource.getRepository(UserEntity).findOne({ where: { id: customerId } });
    if (!user || user.role !== UserRole.Customer) throw new HttpError(404, "Customer not found");

    const { onboarding } = await customerService.getOnboarding(customerId);

    const [subscriptions, documents] = await Promise.all([
      AppDataSource.getRepository(SubscriptionEntity).find({ where: { customerId }, order: { createdAt: "DESC" } }),
      AppDataSource.getRepository(DocumentEntity).find({ where: { customerId }, order: { createdAt: "DESC" } }),
    ]);

    const docIds = documents.map((d) => d.id);
    const phases = docIds.length
      ? await AppDataSource.getRepository(DocumentPhaseEntity).find({ where: { documentId: In(docIds) } })
      : [];

    const documentSummaries = documents.map((doc) => {
      const docPhases = phases.filter((p) => p.documentId === doc.id).sort((a, b) => a.position - b.position);
      return {
        id: doc.id,
        fileName: doc.fileName,
        status: doc.status,
        targetDate: doc.targetDate ?? null,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        progress: computePhaseProgress(docPhases),
      };
    });

    const timeline = await this.buildTimeline(docIds);

    return {
      customer: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        phone: user.phone ?? null,
        accountStatus: user.accountStatus,
        preferredLocale: user.preferredLocale,
        managerId: await assignmentService.getManagerFor(customerId),
      },
      onboarding,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        packageId: s.packageId,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
      })),
      documents: documentSummaries,
      timeline,
    };
  },

  /** Merged document-status + phase history for the customer's documents, newest first. */
  async buildTimeline(documentIds: string[]) {
    if (documentIds.length === 0) return [];
    const [statusHistory, phaseHistory] = await Promise.all([
      AppDataSource.getRepository(DocumentStatusHistoryEntity).find({ where: { documentId: In(documentIds) } }),
      AppDataSource.getRepository(DocumentPhaseHistoryEntity).find({ where: { documentId: In(documentIds) } }),
    ]);

    const entries = [
      ...statusHistory.map((h) => ({
        type: "document_status" as const,
        documentId: h.documentId,
        fromStatus: h.fromStatus ?? null,
        toStatus: h.toStatus,
        note: h.note ?? null,
        at: h.createdAt,
      })),
      ...phaseHistory.map((h) => ({
        type: "phase" as const,
        documentId: h.documentId,
        fromStatus: h.fromStatus ?? null,
        toStatus: h.toStatus,
        note: h.note ?? null,
        at: h.createdAt,
      })),
    ];

    return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 50);
  },
};
