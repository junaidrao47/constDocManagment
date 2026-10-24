import { AppDataSource } from "../../config/database";
import { NotificationLogEntity } from "../../entities/notification-log.entity";
import { CustomerProfileEntity } from "../customers/customer-profile.entity";
import { UserEntity } from "../users/user.entity";
import { logger } from "../../utils/logger";
import { resolveWebUrl } from "../../utils/web-url";
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
  | "phase_completed"
  | "phase_rejected"
  | "account_approved"
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
  portalUrl: resolveWebUrl() ?? "",
});

export const notify = notificationService.notify;

// ── Phase & account emails (PROJECT-BRIEF §11.1/§11.7) ──────────────────────────
//
// Phase emails go to the onboarding `notification_emails` (not the login address)
// in the customer's preferred locale, via the same queue. Kept out of the injected
// `notify()` above because that path resolves a single login-email recipient and
// carries no locale. Both helpers are best-effort: a notification failure must never
// break the phase change or approval that triggered it.

const PHASE_TEMPLATES: Record<"phase_completed" | "phase_rejected", EmailJobData["templateName"]> = {
  phase_completed: "phase-completed",
  phase_rejected: "phase-rejected",
};

const PHASE_SUBJECTS: Record<"phase_completed" | "phase_rejected", { en: string; "es-MX": string }> = {
  phase_completed: { en: "A document phase was completed", "es-MX": "Se completó una fase de su documento" },
  phase_rejected: { en: "A document phase needs attention", "es-MX": "Una fase de su documento requiere atención" },
};

async function resolveCustomerEmailContext(customerId: string): Promise<{
  recipients: string[];
  loginEmail: string;
  locale: EmailJobData["locale"];
  name: string | null;
} | null> {
  const user = await AppDataSource.getRepository(UserEntity).findOne({
    where: { id: customerId },
    select: ["id", "email", "name", "preferredLocale"],
  });
  if (!user) return null;

  const profile = await AppDataSource.getRepository(CustomerProfileEntity).findOne({ where: { customerId } });
  const onboarding = (profile?.notificationEmails ?? []).filter((email) => typeof email === "string" && email.length > 0);
  // Fall back to the login email so a phase change still notifies someone when the
  // customer has not filled in onboarding addresses yet.
  const recipients = onboarding.length > 0 ? onboarding : [user.email];

  return { recipients, loginEmail: user.email, locale: user.preferredLocale, name: user.name ?? null };
}

/** Queues a phase-completed / phase-rejected email to the customer's onboarding addresses. */
export async function notifyPhase(input: {
  customerId: string;
  type: "phase_completed" | "phase_rejected";
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    const repository = notificationRepository();
    await repository.save(repository.create({
      userId: input.customerId,
      type: input.type,
      channel: "email",
      status: "queued",
      sentAt: null,
    }));
  } catch (error) {
    logger.error(`[notification] Could not log ${input.type}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  try {
    const context = await resolveCustomerEmailContext(input.customerId);
    if (!context || context.recipients.length === 0) {
      logger.error(`[notification] ${input.type} has no recipient for customer ${input.customerId}`);
      return;
    }
    const subject = PHASE_SUBJECTS[input.type][context.locale ?? "es-MX"];
    const portalUrl = resolveWebUrl() ?? "";
    const data: Record<string, unknown> = { ...input.data, portalUrl };
    // The caller passes both language names; resolve the one for the customer's locale
    // so the template only needs a single {{phaseName}}.
    if (data.phaseNameEn !== undefined || data.phaseNameEs !== undefined) {
      data.phaseName = context.locale === "en"
        ? (data.phaseNameEn ?? data.phaseNameEs ?? "")
        : (data.phaseNameEs ?? data.phaseNameEn ?? "");
    }
    await Promise.all(
      context.recipients.map((to) =>
        enqueueEmail({
          to,
          templateName: PHASE_TEMPLATES[input.type],
          subject,
          locale: context.locale,
          data,
        }),
      ),
    );
  } catch (error) {
    logger.error(`[notification] Could not enqueue ${input.type}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Queues the "account approved" email to the customer's login address in their locale. */
export async function notifyAccountApproved(customerId: string): Promise<void> {
  try {
    const repository = notificationRepository();
    await repository.save(repository.create({
      userId: customerId,
      type: "account_approved",
      channel: "email",
      status: "queued",
      sentAt: null,
    }));
  } catch (error) {
    logger.error(`[notification] Could not log account_approved: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  try {
    const context = await resolveCustomerEmailContext(customerId);
    if (!context) return;
    const portalUrl = resolveWebUrl() ?? "";
    await enqueueEmail({
      to: context.loginEmail,
      templateName: "account-approved",
      subject: context.locale === "en" ? "Your account has been approved" : "Su cuenta fue aprobada",
      locale: context.locale,
      data: { name: context.name ?? "", portalUrl },
    });
  } catch (error) {
    logger.error(`[notification] Could not enqueue account_approved: ${error instanceof Error ? error.message : String(error)}`);
  }
}
