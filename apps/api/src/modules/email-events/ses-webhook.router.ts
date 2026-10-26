import { NextFunction, Request, Response, Router } from "express";
import express from "express";
import { logger } from "../../utils/logger";
import { emailSuppressionService } from "./email-suppression.service";
import { confirmSubscription, verifySnsMessage, type SnsMessage } from "./sns";

/**
 * SES bounce/complaint webhook (PROJECT-BRIEF §7.7).
 *
 * AWS SES publishes bounce and complaint events to an SNS topic, which POSTs them here.
 * SNS sends the body as text/plain, so this router parses raw text itself rather than
 * relying on the global JSON parser. Every message is signature-verified (see sns.ts)
 * before it is trusted. Bounced/complained recipients are added to the suppression list
 * the worker checks before sending, and subscription-confirmation messages are
 * auto-confirmed. Always answers 200 for an accepted message so SNS does not retry.
 */
export const sesWebhookRouter = Router();

interface SesEvent {
  notificationType?: string;
  eventType?: string;
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: Array<{ emailAddress: string }> };
  complaint?: { complaintFeedbackType?: string; complainedRecipients?: Array<{ emailAddress: string }> };
}

async function handleSesEvent(event: SesEvent): Promise<void> {
  const kind = event.eventType ?? event.notificationType;
  if (kind === "Bounce" && event.bounce) {
    const detail = [event.bounce.bounceType, event.bounce.bounceSubType].filter(Boolean).join("/");
    for (const r of event.bounce.bouncedRecipients ?? []) {
      await emailSuppressionService.suppress(r.emailAddress, "bounce", detail || null);
    }
  } else if (kind === "Complaint" && event.complaint) {
    for (const r of event.complaint.complainedRecipients ?? []) {
      await emailSuppressionService.suppress(r.emailAddress, "complaint", event.complaint.complaintFeedbackType ?? null);
    }
  }
  // Delivery / Send / Open / Click and anything else are ignored.
}

sesWebhookRouter.post(
  "/",
  express.text({ type: () => true, limit: "256kb" }),
  (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      let message: SnsMessage;
      try {
        message = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      } catch {
        res.status(400).json({ success: false, error: "Invalid JSON", code: "BAD_REQUEST" });
        return;
      }

      if (!(await verifySnsMessage(message))) {
        logger.warn("[ses-webhook] rejected a message with an invalid SNS signature");
        res.status(403).json({ success: false, error: "Invalid signature", code: "FORBIDDEN" });
        return;
      }

      if (message.Type === "SubscriptionConfirmation") {
        const confirmed = await confirmSubscription(message.SubscribeURL ?? "");
        logger.info(`[ses-webhook] subscription confirmation ${confirmed ? "succeeded" : "failed"}`);
        res.status(200).json({ success: true, message: "ok" });
        return;
      }

      if (message.Type === "Notification") {
        try {
          await handleSesEvent(JSON.parse(message.Message) as SesEvent);
        } catch (error) {
          logger.error(`[ses-webhook] could not process notification: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      res.status(200).json({ success: true, message: "ok" });
    })().catch(next);
  },
);
