import { env } from "../../config/env";
import { HttpError } from "../../utils/http-error";
import { logger } from "../../utils/logger";
import { enqueueEmail } from "../notifications/email-queue";
import { getSettingValue } from "../public/public.service";
import type { ContactInquiryInput } from "./contact.schema";

/**
 * Where a website inquiry is delivered: the admin-editable `contact_recipient_email` setting
 * (configured in the admin Settings page), falling back to the platform `MAIL_FROM` address so
 * a fresh install still reaches someone. Returns null when neither is a usable address.
 */
async function resolveRecipient(): Promise<string | null> {
  const configured = await getSettingValue("contact_recipient_email");
  if (typeof configured === "string" && configured.includes("@")) return configured;
  return env.mailFrom ?? null;
}

export const contactService = {
  /**
   * Queues a website inquiry as an email to the company. The visitor's own address rides in
   * the body (so staff can reply) rather than as the sender, which must stay the verified
   * `MAIL_FROM`. A missing recipient is a 503 — a configuration gap, not the visitor's fault —
   * with a message that tells them to email directly.
   */
  async submit(input: ContactInquiryInput): Promise<{ received: true }> {
    const recipient = await resolveRecipient();
    if (!recipient) {
      logger.error("[contact] no contact_recipient_email configured and MAIL_FROM is unset; inquiry dropped");
      throw new HttpError(503, "The contact form is not available right now. Please email us directly.");
    }

    const fullName = `${input.firstName} ${input.lastName}`.trim();
    try {
      await enqueueEmail({
        to: recipient,
        templateName: "contact-inquiry",
        subject: `New website inquiry from ${fullName}`,
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          fullName,
          email: input.email,
          phone: input.phone?.trim() ? input.phone.trim() : "—",
          message: input.message,
          submittedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error(`[contact] could not queue inquiry: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpError(502, "We could not send your message right now. Please try again shortly.");
    }

    return { received: true };
  },
};
