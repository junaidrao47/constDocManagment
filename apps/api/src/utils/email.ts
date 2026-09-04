import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Outgoing email.
 *
 * Two transports, chosen by configuration rather than by NODE_ENV:
 *
 *   ses  — used when AWS_REGION and MAIL_FROM are both set. Credentials come from
 *          the standard AWS chain (instance role in production, shared config or
 *          AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY locally), never from code.
 *   log  — used otherwise. Writes the message to the log and reports success.
 *
 * The log transport exists so that flows which depend on email — password reset
 * above all — are testable before SES credentials have been verified. It is
 * deliberately loud: every call warns that nothing was delivered, so a
 * misconfigured deployment is visible rather than silent.
 *
 * Phase 2 moves callers off this module and onto the notification dispatcher,
 * which enqueues a BullMQ job instead of sending inline on the request path.
 * Until then, callers must not let a delivery failure change their response.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailTransport = "ses" | "log";

export function getEmailTransport(): EmailTransport {
  return env.awsRegion && env.mailFrom ? "ses" : "log";
}

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (!sesClient) {
    sesClient = new SESClient({ region: env.awsRegion });
  }

  return sesClient;
}

async function sendViaSes(message: EmailMessage, from: string): Promise<void> {
  await getSesClient().send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [message.to] },
      Message: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: message.text, Charset: "UTF-8" },
          ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}),
        },
      },
    }),
  );
}

/**
 * Sends `message` and reports whether it was delivered.
 *
 * Never throws. Callers such as forgot-password must return the same response
 * whether or not delivery succeeded, so a transport failure is logged and
 * reported in the return value instead of propagating as a 500 that would leak
 * whether the address exists.
 */
export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean; transport: EmailTransport }> {
  const transport = getEmailTransport();

  if (transport === "log") {
    logger.warn(
      `[email] not delivered — no MAIL_FROM/AWS_REGION configured. ` +
        `Would have sent "${message.subject}" to ${message.to}`,
    );
    logger.info(`[email] body:\n${message.text}`);
    return { delivered: false, transport };
  }

  try {
    await sendViaSes(message, env.mailFrom as string);
    logger.info(`[email] sent "${message.subject}" to ${message.to}`);
    return { delivered: true, transport };
  } catch (error) {
    // A common first cause is the SES sandbox, which only permits delivery to
    // verified addresses. Surface the reason without failing the request.
    const reason = error instanceof Error ? error.message : "unknown error";
    logger.error(`[email] SES delivery failed for ${message.to}: ${reason}`);
    return { delivered: false, transport };
  }
}
