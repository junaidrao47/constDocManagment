import { AppDataSource } from "../../config/database";
import { NotificationLogEntity } from "../../entities/notification-log.entity";
import { UserEntity } from "../users/user.entity";
import { logger } from "../../utils/logger";
import { enqueueEmail, type EmailJobData } from "./email-queue";

export type { EmailJobData } from "./email-queue";

export type NotificationType =
  | "quotation_sent"
  | "quotation_accepted"
  | "quotation_rejected"
  | "document_approved"
  | "document_rejected"
  | "invoice_issued"
  | "payment_recorded"
  // Recorded for the audit trail and a future in-portal feed; no email template.
  | "document_status_changed"
  | "quotation_status_changed";

interface NotifyDependencies {
  createLog(input: Pick<NotificationLogEntity, "userId" | "type" | "channel" | "status" | "sentAt">): Promise<NotificationLogEntity>;
  saveLog(log: NotificationLogEntity): Promise<NotificationLogEntity>;
  findRecipient(userId: string): Promise<string | null>;
  enqueue(data: EmailJobData): Promise<unknown>;
  logError(message: string): void;
  portalUrl: string;
}

const eventEmail: Partial<Record<NotificationType, { templateName: EmailJobData["templateName"]; subject: string }>> = {
  quotation_sent: { templateName: "quotation-ready", subject: "Your quotation is ready" },
  quotation_accepted: { templateName: "quotation-accepted", subject: "Your quotation was accepted" },
  quotation_rejected: { templateName: "quotation-rejected", subject: "Your quotation was rejected" },
  document_approved: { templateName: "document-approved", subject: "Your document was approved" },
  document_rejected: { templateName: "document-rejected", subject: "Action required for your document" },
  invoice_issued: { templateName: "invoice", subject: "Your invoice is ready" },
  payment_recorded: { templateName: "payment-recorded", subject: "Your payment was recorded" },
};

export function createNotifyService(dependencies: NotifyDependencies) {
  return {
    async notify(input: { userId: string; type: NotificationType; data: Record<string, unknown> }): Promise<void> {
      const email = eventEmail[input.type];
      let log: NotificationLogEntity | undefined;
      try {
        log = await dependencies.createLog({
          userId: input.userId,
          type: input.type,
          channel: email ? "email" : "in_app",
          status: email ? "queued" : "recorded",
          sentAt: null,
        });
      } catch (error) {
        dependencies.logError(`Could not create ${input.type} notification log: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      if (!email) return;

      let timeout: NodeJS.Timeout | undefined;
      try {
        const recipient = await dependencies.findRecipient(input.userId);
        if (!recipient) throw new Error("Notification recipient has no email address");
        const payload = {
          to: recipient,
          templateName: email.templateName,
          subject: email.subject,
          data: { ...input.data, portalUrl: dependencies.portalUrl },
        };

        await Promise.race([
          dependencies.enqueue(payload),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Notification queue timed out")), 2000);
          }),
        ]);
      } catch (error) {
        dependencies.logError(`Could not enqueue ${input.type} notification: ${error instanceof Error ? error.message : String(error)}`);
        if (log) {
          log.status = "failed";
          try {
            await dependencies.saveLog(log);
          } catch (saveError) {
            dependencies.logError(`Could not mark ${input.type} notification failed: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
          }
        }
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    },
  };
}

const notificationRepository = () => AppDataSource.getRepository(NotificationLogEntity);
const userRepository = () => AppDataSource.getRepository(UserEntity);

export const notificationService = createNotifyService({
  createLog: async (input) => {
    const repository = notificationRepository();
    return repository.save(repository.create(input));
  },
  saveLog: async (log) => notificationRepository().save(log),
  findRecipient: async (userId) => {
    const user = await userRepository().findOne({ where: { id: userId }, select: ["email"] });
    return user?.email ?? null;
  },
  enqueue: (data) => enqueueEmail(data),
  logError: (message) => logger.error(`[notification] ${message}`),
  portalUrl: process.env.WEB_URL ?? "",
});

export const notify = notificationService.notify;
