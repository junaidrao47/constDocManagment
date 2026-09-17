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

export async function sendTransactionalEmail(message: { to: string; subject: string; text: string; html: string }): Promise<void> {
  if (!env.awsRegion || !env.mailFrom) {
    console.warn(`[worker:email] skipped email to ${message.to}: AWS_REGION or MAIL_FROM is not configured`);
    return;
  }

  await getClient().send(new SendEmailCommand({
    Source: env.mailFrom,
    ...(env.sesConfigurationSet ? { ConfigurationSetName: env.sesConfigurationSet } : {}),
    Destination: { ToAddresses: [message.to] },
    Message: {
      Subject: { Data: message.subject, Charset: "UTF-8" },
      Body: { Text: { Data: message.text, Charset: "UTF-8" }, Html: { Data: message.html, Charset: "UTF-8" } },
    },
  }));
}