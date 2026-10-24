import { AppError } from "../../utils/http-error";

export enum DocumentStatus {
  Pending = "pending",
  UnderReview = "under_review",
  Approved = "approved",
  SubmittedToGovernment = "submitted_to_government",
  Rejected = "rejected",
  ExpiringSoon = "expiring_soon",
  Expired = "expired",
}

/**
 * Who may move a document through the flow.
 *
 * Agents and managers can review; admins retain the override.
 */
export type DocumentStatusActorRole = "agent" | "manager" | "admin";

const DOCUMENT_STATUS_ACTOR_ROLES: readonly DocumentStatusActorRole[] = ["agent", "manager", "admin"];

/**
 * The base state machine: every transition any actor could ever make. It is the
 * union used by the admin override and by `assertDocumentStatusTransition`; the
 * per-role overlay below is what actually gates a given caller.
 *
 * `approved → submitted_to_government` marks "taken to the government, official file
 * still pending"; the official-file upload then moves it back to `approved`, now
 * carrying an official version (see docs/decision-log.md 2026-10-20). `expiring_soon`
 * and `expired` are reached only by the expiry cron, never by a user.
 */
export const DOCUMENT_STATUS_FLOW: Record<DocumentStatus, DocumentStatus[]> = {
  [DocumentStatus.Pending]: [DocumentStatus.UnderReview],
  [DocumentStatus.UnderReview]: [DocumentStatus.Approved, DocumentStatus.Rejected],
  [DocumentStatus.Approved]: [DocumentStatus.SubmittedToGovernment, DocumentStatus.ExpiringSoon],
  [DocumentStatus.SubmittedToGovernment]: [DocumentStatus.Approved],
  [DocumentStatus.Rejected]: [DocumentStatus.Pending],
  [DocumentStatus.ExpiringSoon]: [DocumentStatus.Expired],
  [DocumentStatus.Expired]: [],
};

/**
 * The single source of truth frontends read through `GET /api/documents/statuses`:
 * which transitions each role may perform, so no client hardcodes the flow.
 *
 * - `customer`: only resubmit after a rejection (`rejected → pending`); the first
 *   upload leaves the document `pending`.
 * - staff (`agent`/`manager`/`admin`): drive the review flow. `submitted_to_government
 *   → approved` is performed by the official-file upload, not a bare status PATCH.
 */
export const TRANSITIONS_BY_ROLE: Record<"customer" | DocumentStatusActorRole, Partial<Record<DocumentStatus, DocumentStatus[]>>> = {
  customer: {
    [DocumentStatus.Rejected]: [DocumentStatus.Pending],
  },
  agent: {
    [DocumentStatus.Pending]: [DocumentStatus.UnderReview],
    [DocumentStatus.UnderReview]: [DocumentStatus.Approved, DocumentStatus.Rejected],
    [DocumentStatus.Approved]: [DocumentStatus.SubmittedToGovernment],
    [DocumentStatus.SubmittedToGovernment]: [DocumentStatus.Approved],
  },
  manager: {
    [DocumentStatus.Pending]: [DocumentStatus.UnderReview],
    [DocumentStatus.UnderReview]: [DocumentStatus.Approved, DocumentStatus.Rejected],
    [DocumentStatus.Approved]: [DocumentStatus.SubmittedToGovernment],
    [DocumentStatus.SubmittedToGovernment]: [DocumentStatus.Approved],
  },
  admin: {
    [DocumentStatus.Pending]: [DocumentStatus.UnderReview],
    [DocumentStatus.UnderReview]: [DocumentStatus.Approved, DocumentStatus.Rejected],
    [DocumentStatus.Approved]: [DocumentStatus.SubmittedToGovernment],
    [DocumentStatus.SubmittedToGovernment]: [DocumentStatus.Approved],
  },
};

/** Display-metadata keys only; the label/colour copy is the frontend's job, keyed off status. */
export const DOCUMENT_STATUS_META: Record<DocumentStatus, { key: string; terminal: boolean }> = {
  [DocumentStatus.Pending]: { key: "document.status.pending", terminal: false },
  [DocumentStatus.UnderReview]: { key: "document.status.under_review", terminal: false },
  [DocumentStatus.Approved]: { key: "document.status.approved", terminal: false },
  [DocumentStatus.SubmittedToGovernment]: { key: "document.status.submitted_to_government", terminal: false },
  [DocumentStatus.Rejected]: { key: "document.status.rejected", terminal: false },
  [DocumentStatus.ExpiringSoon]: { key: "document.status.expiring_soon", terminal: false },
  [DocumentStatus.Expired]: { key: "document.status.expired", terminal: true },
};

export const DOCUMENT_STATUSES: DocumentStatus[] = Object.values(DocumentStatus);

/** The payload `GET /api/documents/statuses` returns. */
export function getDocumentStatusContract() {
  return {
    statuses: DOCUMENT_STATUSES.map((status) => ({ value: status, ...DOCUMENT_STATUS_META[status] })),
    transitionsByRole: TRANSITIONS_BY_ROLE,
  };
}

export function getAllowedDocumentStatuses(from: DocumentStatus): DocumentStatus[] {
  return DOCUMENT_STATUS_FLOW[from];
}

export function canTransitionDocumentStatus(from: DocumentStatus, to: DocumentStatus): boolean {
  return DOCUMENT_STATUS_FLOW[from].includes(to);
}

/** Whether `role` may perform the `from → to` transition. */
export function canRoleTransition(role: "customer" | DocumentStatusActorRole, from: DocumentStatus, to: DocumentStatus): boolean {
  return (TRANSITIONS_BY_ROLE[role]?.[from] ?? []).includes(to);
}

/**
 * Rejects an illegal transition with 409 rather than a bare `Error`.
 *
 * The message names the moves allowed from here, so a client can recover without
 * consulting the flow table. When a role is supplied the per-role overlay is used,
 * so an agent is told what an agent may do, not what the machine could theoretically do.
 */
export function assertDocumentStatusTransition(
  from: DocumentStatus,
  to: DocumentStatus,
  role?: "customer" | DocumentStatusActorRole,
): void {
  const allowed = role ? TRANSITIONS_BY_ROLE[role]?.[from] ?? [] : getAllowedDocumentStatuses(from);
  if (!allowed.includes(to)) {
    const options = allowed.length > 0 ? allowed.join(", ") : "none — this is a terminal status";
    throw new AppError(
      "INVALID_STATUS_TRANSITION",
      409,
      `Cannot move a document from ${from} to ${to}${role ? ` as ${role}` : ""}. Allowed from ${from}: ${options}`,
    );
  }
}

export function canMutateDocumentStatus(role: string): role is DocumentStatusActorRole {
  return (DOCUMENT_STATUS_ACTOR_ROLES as readonly string[]).includes(role);
}
