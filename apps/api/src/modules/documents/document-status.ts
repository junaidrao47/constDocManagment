export enum DocumentStatus {
  Pending = "pending",
  UnderReview = "under_review",
  Approved = "approved",
  Rejected = "rejected",
  ExpiringSoon = "expiring_soon",
  Expired = "expired",
}

export type DocumentStatusActorRole = "agent" | "admin";

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

export function assertDocumentStatusTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!canTransitionDocumentStatus(from, to)) {
    throw new Error(`Invalid document status transition: ${from} -> ${to}`);
  }
}

export function canMutateDocumentStatus(role: string): role is DocumentStatusActorRole {
  return role === "agent" || role === "admin";
}