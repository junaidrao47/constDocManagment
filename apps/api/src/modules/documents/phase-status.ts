import { AppError } from "../../utils/http-error";

/**
 * Document approval-phase statuses (PROJECT-BRIEF §11.5).
 *
 * Stored as a plain `varchar`, not a Postgres enum: §10.3 says statuses will change
 * after the client's first-delivery feedback, and a varchar avoids an enum ALTER
 * each time. Allowed transitions live only here, exposed to frontends through the
 * contract getter, so no client hardcodes the flow.
 */
export enum PhaseStatus {
  NotStarted = "not_started",
  InProgress = "in_progress",
  Completed = "completed",
  Rejected = "rejected",
}

export const PHASE_STATUSES: PhaseStatus[] = Object.values(PhaseStatus);

/**
 * The phase state machine. A manager drives every move. `completed` is reachable
 * from any active state (also set implicitly when a result file is uploaded); a
 * `rejected` phase can be reopened to `in_progress`; `completed` can be reopened if
 * the manager marks more work is needed.
 */
export const PHASE_STATUS_FLOW: Record<PhaseStatus, PhaseStatus[]> = {
  [PhaseStatus.NotStarted]: [PhaseStatus.InProgress, PhaseStatus.Completed, PhaseStatus.Rejected],
  [PhaseStatus.InProgress]: [PhaseStatus.Completed, PhaseStatus.Rejected],
  [PhaseStatus.Rejected]: [PhaseStatus.InProgress, PhaseStatus.Completed],
  [PhaseStatus.Completed]: [PhaseStatus.InProgress],
};

export const PHASE_STATUS_META: Record<PhaseStatus, { key: string; terminal: boolean }> = {
  [PhaseStatus.NotStarted]: { key: "phase.status.not_started", terminal: false },
  [PhaseStatus.InProgress]: { key: "phase.status.in_progress", terminal: false },
  [PhaseStatus.Completed]: { key: "phase.status.completed", terminal: false },
  [PhaseStatus.Rejected]: { key: "phase.status.rejected", terminal: false },
};

/** Payload for `GET /api/documents/phases/statuses`, so no client hardcodes the flow. */
export function getPhaseStatusContract() {
  return {
    statuses: PHASE_STATUSES.map((status) => ({ value: status, ...PHASE_STATUS_META[status] })),
    flow: PHASE_STATUS_FLOW,
  };
}

export function canTransitionPhase(from: PhaseStatus, to: PhaseStatus): boolean {
  return from === to || PHASE_STATUS_FLOW[from].includes(to);
}

/** Rejects an illegal phase transition with a precise 409 code. */
export function assertPhaseStatusTransition(from: PhaseStatus, to: PhaseStatus): void {
  if (canTransitionPhase(from, to)) return;
  const allowed = PHASE_STATUS_FLOW[from];
  const options = allowed.length > 0 ? allowed.join(", ") : "none — this is a terminal status";
  throw new AppError(
    "PHASE_INVALID_TRANSITION",
    409,
    `Cannot move a phase from ${from} to ${to}. Allowed from ${from}: ${options}`,
  );
}

export function isPhaseStatus(value: string): value is PhaseStatus {
  return (PHASE_STATUSES as string[]).includes(value);
}
