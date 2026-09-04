import { HttpError } from "../../utils/http-error";

export enum DocumentStatus {
  Pending = "pending",
  UnderReview = "under_review",
  Approved = "approved",
  Rejected = "rejected",
  ExpiringSoon = "expiring_soon",
  Expired = "expired",
}

/**
 * Who may move a document through the flow.
 *
 * Agents and managers can approve; admins retain the override.
 */
export type DocumentStatusActorRole = "agent" | "manager" | "admin";

const DOCUMENT_STATUS_ACTOR_ROLES: readonly DocumentStatusActorRole[] = ["agent", "manager", "admin"];

export const DOCUMENT_STATUS_FLOW: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.Pending]: [DocumentStatus.UnderReview],
  [DocumentStatus.UnderReview]: [DocumentStatus.Approved, DocumentStatus.Rejected],
  [DocumentStatus.Approved]: [DocumentStatus.ExpiringSoon],
  [DocumentStatus.Rejected]: [],
  [DocumentStatus.ExpiringSoon]: [DocumentStatus.Expired],
  [DocumentStatus.Expired]: [],
};

export function getAllowedDocumentStatuses(from: DocumentStatus): DocumentStatus[] {
  return DOCUMENT_STATUS_FLOW[from];
}

export function canTransitionDocumentStatus(from: DocumentStatus, to: DocumentStatus): boolean {
  return DOCUMENT_STATUS_FLOW[from].includes(to);
}

/**
 * Rejects an illegal transition with 409 rather than a bare `Error`.
 *
 * A plain Error reached the error handler as an unclassified failure and was
 * reported as 500, which reads as "the server broke" when the real answer is "that
 * move is not allowed from here". The message names the moves that are allowed, so
 * a client can recover without consulting the flow table.
 */
export function assertDocumentStatusTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!canTransitionDocumentStatus(from, to)) {
    const allowed = getAllowedDocumentStatuses(from);
    const options = allowed.length > 0 ? allowed.join(", ") : "none — this is a terminal status";

    throw new HttpError(409, `Cannot move a document from ${from} to ${to}. Allowed from ${from}: ${options}`);
  }
}

export function canMutateDocumentStatus(role: string): role is DocumentStatusActorRole {
  return (DOCUMENT_STATUS_ACTOR_ROLES as readonly string[]).includes(role);
}
