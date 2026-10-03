import { SendEmailCommand, SESClient } from "@aws-sdk/client-ses";
import { env } from "../config/env";

let client: SESClient | null = null;

function getClient(): SESClient {
  client ??= new SESClient({
    region: env.awsRegion,
    credentials: process.env.SES_ACCESS_KEY_ID && process.env.SES_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.SES_ACCESS_KEY_ID, secretAccessKey: process.env.SES_SECRET_ACCESS_KEY }
      : undefined,
  });
  return client;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  configurationSet?: string;
}

export type EmailTransport = "ses" | "log";

export function getEmailTransport(): EmailTransport {
  return env.awsRegion && env.mailFrom ? "ses" : "log";
}

export async function sendEmail(message: EmailMessage): Promise<{ delivered: boolean; transport: EmailTransport }> {
  const transport = getEmailTransport();

  if (!env.awsRegion || !env.mailFrom) {
    console.warn(`[worker:email] not delivered — AWS_REGION or MAIL_FROM is not configured. Would have sent "${message.subject}" to ${message.to}`);
    console.info(`[worker:email] body:\n${message.text}`);
    return { delivered: false, transport };
  }

  try {
    await getClient().send(new SendEmailCommand({
      Source: env.mailFrom,
      ...(message.configurationSet || env.sesConfigurationSet ? { ConfigurationSetName: message.configurationSet ?? env.sesConfigurationSet } : {}),
      Destination: { ToAddresses: [message.to] },
      Message: {
        Subject: { Data: message.subject, Charset: "UTF-8" },
        Body: { Text: { Data: message.text, Charset: "UTF-8" }, ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}) },
      },
    }));
    console.info(`[worker:email] sent "${message.subject}" to ${message.to}`);
    return { delivered: true, transport };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.error(`[worker:email] SES delivery failed for ${message.to}: ${reason}`);
    return { delivered: false, transport };
  }
}

export const sendTransactionalEmail = sendEmail;