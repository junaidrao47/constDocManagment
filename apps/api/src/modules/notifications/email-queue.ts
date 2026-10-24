import { Queue } from "bullmq";
import IORedis from "ioredis";

/**
 * The API's handle on the worker's `email` queue.
 *
 * Kept in its own module so the test suite can map it to an in-memory fake (see
 * jest.config.js), the same way config/redis and utils/email are faked. Without
 * that, every test that changes a status would open a real Redis connection.
 */
export interface EmailJobData {
  to: string;
  templateName:
    | "document-approved"
    | "document-rejected"
    | "quotation-ready"
    | "quotation-accepted"
    | "quotation-rejected"
    | "invoice"
    | "payment-recorded"
    | "renewal-reminder"
    | "contact-inquiry"
    | "phase-completed"
    | "phase-rejected"
    | "account-approved";
  subject?: string;
  /** Which localized template the worker renders; defaults to es-MX when absent. */
  locale?: "en" | "es-MX";
  data: Record<string, unknown>;
}

let emailQueue: Queue<EmailJobData> | undefined;

function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("REDIS_URL is required to enqueue notifications");
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    emailQueue = new Queue<EmailJobData>("email", { connection });
  }
  return emailQueue;
}

export function enqueueEmail(data: EmailJobData): Promise<unknown> {
  return getEmailQueue().add("send-email", data);
}
