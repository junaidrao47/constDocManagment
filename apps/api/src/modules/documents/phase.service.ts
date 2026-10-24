import { AppDataSource } from "../../config/database";
import { AppError, HttpError } from "../../utils/http-error";
import { webUrlFor } from "../../utils/web-url";
import { assignmentService } from "../assignments/assignment.service";
import { notifyPhase } from "../notifications/notify.service";
import { UserRole } from "../users/user.entity";
import { DocumentEntity } from "./document.entity";
import { DocumentPhaseEntity } from "./document-phase.entity";
import { DocumentPhaseHistoryEntity } from "./document-phase-history.entity";
import {
  computePhaseProgress,
  documentService,
  listPhasesForDocument,
  serializePhase,
  type DocumentActor,
} from "./document.service";
import {
  assertPhaseStatusTransition,
  getPhaseStatusContract,
  PhaseStatus,
} from "./phase-status";
import type { CreatePhasesInput, UpdatePhaseInput } from "./phase.schema";

function assertDatabaseReady(): void {
  if (!AppDataSource.isInitialized) {
    throw new HttpError(503, "Database is not initialized");
  }
}

function documentRepo() {
  return AppDataSource.getRepository(DocumentEntity);
}
function phaseRepo() {
  return AppDataSource.getRepository(DocumentPhaseEntity);
}

async function requireDocument(documentId: string): Promise<DocumentEntity> {
  const document = await documentRepo().findOne({ where: { id: documentId } });
  if (!document) throw new HttpError(404, "Document not found");
  return document;
}

/**
 * Phases are managed by the customer's assigned manager, or any admin. An agent —
 * even an assigned one — cannot, and a manager cannot touch a customer who is not
 * theirs.
 */
async function assertCanManagePhases(actor: DocumentActor, document: DocumentEntity): Promise<void> {
  if (actor.role === UserRole.Admin) return;
  if (actor.role === UserRole.Manager && (await assignmentService.isManagerFor(actor.id, document.customerId))) return;
  throw new HttpError(403, "Forbidden");
}

async function requirePhase(documentId: string, phaseId: string): Promise<DocumentPhaseEntity> {
  const phase = await phaseRepo().findOne({ where: { id: phaseId } });
  if (!phase || phase.documentId !== documentId) throw new HttpError(404, "Phase not found");
  return phase;
}

/** Builds the email payload shared by completed/rejected phase notifications. */
function phaseEmailData(document: DocumentEntity, phase: DocumentPhaseEntity, extra: Record<string, unknown> = {}) {
  return {
    documentName: document.fileName,
    phaseNameEn: phase.nameEn,
    phaseNameEs: phase.nameEs,
    note: phase.note ?? "",
    ...extra,
  };
}

export const phaseService = {
  getStatusContract() {
    return getPhaseStatusContract();
  },

  /** Phases + progress for a document, access-checked like any other read. */
  async listPhases(actor: DocumentActor, documentId: string) {
    assertDatabaseReady();
    // Delegates the read-access rule (own document / staff) to the document service.
    const document = await documentService.getDocument(actor, documentId);
    return { phases: document.phases, progress: document.progress };
  },

  /** Create new phases (appended) and/or reorder existing ones. */
  async createOrReorder(actor: DocumentActor, documentId: string, input: CreatePhasesInput) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanManagePhases(actor, document);

    await AppDataSource.transaction(async (manager) => {
      if (input.phases && input.phases.length > 0) {
        const existing = await manager.find(DocumentPhaseEntity, { where: { documentId } });
        let nextPosition = existing.reduce((max, p) => Math.max(max, p.position), -1) + 1;
        for (const item of input.phases) {
          await manager.save(DocumentPhaseEntity, manager.create(DocumentPhaseEntity, {
            documentId,
            position: nextPosition,
            nameEn: item.nameEn,
            nameEs: item.nameEs,
            department: item.department ?? null,
            targetDate: item.targetDate ?? null,
            status: PhaseStatus.NotStarted,
          }));
          nextPosition += 1;
        }
      }

      if (input.order && input.order.length > 0) {
        const phases = await manager.find(DocumentPhaseEntity, { where: { documentId } });
        const byId = new Map(phases.map((p) => [p.id, p]));
        // Every id must belong to this document, or the reorder is rejected whole.
        for (const id of input.order) {
          if (!byId.has(id)) throw new HttpError(400, `Phase ${id} does not belong to this document`);
        }
        let position = 0;
        for (const id of input.order) {
          const phase = byId.get(id)!;
          phase.position = position;
          await manager.save(DocumentPhaseEntity, phase);
          position += 1;
        }
      }
    });

    const phases = await listPhasesForDocument(documentId);
    return { phases: phases.map(serializePhase), progress: computePhaseProgress(phases) };
  },

  /** Edit a phase and/or move its status, writing history and emailing in one transaction. */
  async updatePhase(actor: DocumentActor, documentId: string, phaseId: string, input: UpdatePhaseInput) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanManagePhases(actor, document);
    const phase = await requirePhase(documentId, phaseId);

    const fromStatus = phase.status;
    const toStatus = input.status ?? fromStatus;
    const statusChanged = toStatus !== fromStatus;
    if (statusChanged) assertPhaseStatusTransition(fromStatus, toStatus);
    if (toStatus === PhaseStatus.Rejected && (input.note?.trim().length ?? 0) < 5) {
      throw new AppError("NOTE_REQUIRED", 400, "A rejection note of at least 5 characters is required");
    }

    await AppDataSource.transaction(async (manager) => {
      if (input.nameEn !== undefined) phase.nameEn = input.nameEn;
      if (input.nameEs !== undefined) phase.nameEs = input.nameEs;
      if (input.department !== undefined) phase.department = input.department;
      if (input.targetDate !== undefined) phase.targetDate = input.targetDate;
      if (input.note !== undefined) phase.note = input.note;

      if (statusChanged) {
        phase.status = toStatus;
        if (toStatus === PhaseStatus.Completed) {
          phase.completedAt = new Date();
          phase.completedBy = actor.id;
        } else {
          phase.completedAt = null;
          phase.completedBy = null;
        }
      }

      await manager.save(DocumentPhaseEntity, phase);

      if (statusChanged) {
        await manager.save(DocumentPhaseHistoryEntity, {
          phaseId: phase.id,
          documentId,
          fromStatus,
          toStatus,
          note: input.note ?? null,
          changedBy: actor.id,
        });
      }
    });

    await this.emailOnStatus(document, phase, fromStatus, toStatus, documentId);

    const phases = await listPhasesForDocument(documentId);
    return { phase: serializePhase(phase), progress: computePhaseProgress(phases) };
  },

  /** Issues an upload target for a phase's result file. */
  async createResultIntent(actor: DocumentActor, documentId: string, phaseId: string, input: { fileName: string; contentType: string }) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanManagePhases(actor, document);
    await requirePhase(documentId, phaseId);
    return documentService.createPhaseResultIntent(actor, documentId, input);
  },

  /**
   * Confirms an uploaded phase result: validates the bytes (via the document
   * service), then marks the phase completed and links the version, writing history
   * and emailing the customer — all after the version is confirmed ready.
   */
  async confirmResult(actor: DocumentActor, documentId: string, phaseId: string, versionId: string) {
    assertDatabaseReady();
    const document = await requireDocument(documentId);
    await assertCanManagePhases(actor, document);
    const phase = await requirePhase(documentId, phaseId);

    const version = await documentService.confirmPhaseResultVersion(actor, documentId, versionId);

    const fromStatus = phase.status;
    assertPhaseStatusTransition(fromStatus, PhaseStatus.Completed);

    await AppDataSource.transaction(async (manager) => {
      phase.status = PhaseStatus.Completed;
      phase.resultVersionId = version.id;
      phase.completedAt = new Date();
      phase.completedBy = actor.id;
      await manager.save(DocumentPhaseEntity, phase);

      await manager.save(DocumentPhaseHistoryEntity, {
        phaseId: phase.id,
        documentId,
        fromStatus,
        toStatus: PhaseStatus.Completed,
        note: `Result file uploaded (version ${version.versionNo})`,
        changedBy: actor.id,
      });
    });

    await this.emailOnStatus(document, phase, fromStatus, PhaseStatus.Completed, documentId);

    const phases = await listPhasesForDocument(documentId);
    return { phase: serializePhase(phase), progress: computePhaseProgress(phases) };
  },

  /** Queues the right customer email for a status move (nothing for non-terminal moves). */
  async emailOnStatus(document: DocumentEntity, phase: DocumentPhaseEntity, fromStatus: PhaseStatus, toStatus: PhaseStatus, documentId: string): Promise<void> {
    if (toStatus === fromStatus) return;
    if (toStatus === PhaseStatus.Completed) {
      const phases = await listPhasesForDocument(documentId);
      const progress = computePhaseProgress(phases);
      await notifyPhase({
        customerId: document.customerId,
        type: "phase_completed",
        data: phaseEmailData(document, phase, { progressPercent: progress.percent, documentUrl: webUrlFor("/dashboard/documents") }),
      });
    } else if (toStatus === PhaseStatus.Rejected) {
      await notifyPhase({
        customerId: document.customerId,
        type: "phase_rejected",
        data: phaseEmailData(document, phase, { documentUrl: webUrlFor("/dashboard/documents") }),
      });
    }
  },
};
