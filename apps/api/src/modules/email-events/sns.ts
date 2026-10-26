import crypto from "crypto";

/**
 * Minimal, dependency-free Amazon SNS message verification.
 *
 * The SES notification webhook is a public, unauthenticated endpoint, so every message
 * must be cryptographically verified before it is trusted: the signing certificate URL
 * must be an AWS SNS host over https, and the signature must validate against that
 * certificate's public key over the canonical string AWS defines. Without this, anyone
 * could POST a forged "complaint" and get an address suppressed.
 *
 * Refs: AWS SNS "Verifying the signatures of Amazon SNS messages".
 */

export interface SnsMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
}

// Signing-cert host allowlist: sns.<region>.amazonaws.com (incl. the China partition).
const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

function isAllowedAwsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && CERT_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

/** The exact field order AWS signs, per message type. Subject is included only if present. */
function canonicalMessage(msg: SnsMessage): string | null {
  const field = (key: string, value: string | undefined): string => (value === undefined ? "" : `${key}\n${value}\n`);
  if (msg.Type === "Notification") {
    return (
      field("Message", msg.Message) +
      field("MessageId", msg.MessageId) +
      field("Subject", msg.Subject) +
      field("Timestamp", msg.Timestamp) +
      field("TopicArn", msg.TopicArn) +
      field("Type", msg.Type)
    );
  }
  if (msg.Type === "SubscriptionConfirmation" || msg.Type === "UnsubscribeConfirmation") {
    return (
      field("Message", msg.Message) +
      field("MessageId", msg.MessageId) +
      field("SubscribeURL", msg.SubscribeURL) +
      field("Timestamp", msg.Timestamp) +
      field("Token", msg.Token) +
      field("TopicArn", msg.TopicArn) +
      field("Type", msg.Type)
    );
  }
  return null;
}

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`cert fetch returned ${response.status}`);
  const pem = await response.text();
  certCache.set(url, pem);
  return pem;
}

/**
 * Returns true only if the message is well-formed, its SigningCertURL is an AWS SNS
 * host over https, and the signature validates against that cert. Never throws.
 */
export async function verifySnsMessage(msg: SnsMessage): Promise<boolean> {
  try {
    if (!msg || !msg.Signature || !msg.SigningCertURL) return false;
    if (!isAllowedAwsUrl(msg.SigningCertURL)) return false;

    const canonical = canonicalMessage(msg);
    if (canonical === null) return false;

    // SignatureVersion 1 = RSA-SHA1, 2 = RSA-SHA256. Reject anything else.
    const algorithm = msg.SignatureVersion === "1" ? "RSA-SHA1" : msg.SignatureVersion === "2" ? "RSA-SHA256" : null;
    if (!algorithm) return false;

    const pem = await fetchCert(msg.SigningCertURL);
    const publicKey = new crypto.X509Certificate(pem).publicKey;

    return crypto
      .createVerify(algorithm)
      .update(canonical, "utf8")
      .verify(publicKey, Buffer.from(msg.Signature, "base64"));
  } catch {
    return false;
  }
}

/** Confirm a subscription by GET-ing the (validated) SubscribeURL AWS provided. */
export async function confirmSubscription(subscribeUrl: string): Promise<boolean> {
  if (!isAllowedAwsUrl(subscribeUrl)) return false;
  try {
    const response = await fetch(subscribeUrl, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}
