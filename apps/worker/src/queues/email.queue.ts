import { Queue, type JobsOptions } from "bullmq";
import { redisConnection } from "../config/redis";

export const EMAIL_QUEUE_NAME = "email";
export const EMAIL_DEAD_LETTER_QUEUE_NAME = "email-dead-letter";

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
	connection: redisConnection,
	defaultJobOptions: {
		attempts: 3,
		backoff: { type: "exponential", delay: 5_000 },
		removeOnComplete: { age: 86_400, count: 1_000 },
		removeOnFail: false,
	},
});

export const emailDeadLetterQueue = new Queue(EMAIL_DEAD_LETTER_QUEUE_NAME, {
	connection: redisConnection,
	defaultJobOptions: { removeOnComplete: { age: 604_800, count: 5_000 } },
});

export const addEmailJob = (data: EmailJobData, options?: JobsOptions) => emailQueue.add("send-email", data, options);

export async function closeEmailQueue(): Promise<void> {
	await Promise.all([emailQueue.close(), emailDeadLetterQueue.close()]);
}

export interface EmailJobData {
	to: string;
	templateName: "document-approved" | "document-rejected" | "quotation-ready" | "invoice" | "renewal-reminder";
	subject?: string;
	data: Record<string, unknown>;
}

export interface FailedEmailJobData extends EmailJobData {
	failure: string;
	failedAt: string;
}
