import type { EmailJobData } from "../../src/modules/notifications/email-queue";

/**
 * In-memory stand-in for the BullMQ `email` queue, mapped in jest.config.js.
 *
 * The real module opens a Redis connection; in tests nothing listens on REDIS_URL,
 * so that connection would retry forever and keep Jest from exiting. Tests read
 * `queuedEmails` to assert what would have been sent to the worker.
 */
export type { EmailJobData };

export const queuedEmails: EmailJobData[] = [];

export async function enqueueEmail(data: EmailJobData): Promise<{ id: string }> {
  queuedEmails.push(data);
  return { id: `job-${queuedEmails.length}` };
}

export function resetQueuedEmails(): void {
  queuedEmails.length = 0;
}
