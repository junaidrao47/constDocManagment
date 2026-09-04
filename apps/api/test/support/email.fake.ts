/**
 * Stands in for src/utils/email.
 *
 * Mapped globally in jest.config.js rather than per test file, so no test can ever
 * reach SES — the credentials for it are unverified, and a suite that quietly tries
 * to deliver mail would be both slow and wrong.
 *
 * The real module already degrades to logging when MAIL_FROM is absent. What this
 * adds is an outbox, which is the only way to get at the reset link: the token is
 * deliberately absent from the API response, so the email is where it lives.
 */

export type EmailTransport = "ses" | "log";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const outbox: EmailMessage[] = [];

/** Set by a test to simulate a delivery failure. */
export const emailBehaviour = { delivered: true };

export function getEmailTransport(): EmailTransport {
  return "log";
}

export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean; transport: EmailTransport }> {
  outbox.push(message);
  return { delivered: emailBehaviour.delivered, transport: "log" };
}

export function lastEmailTo(address: string): EmailMessage | undefined {
  return [...outbox].reverse().find((message) => message.to.toLowerCase() === address.toLowerCase());
}

export function resetOutbox(): void {
  outbox.length = 0;
  emailBehaviour.delivered = true;
}
