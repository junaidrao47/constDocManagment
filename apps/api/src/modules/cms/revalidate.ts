import crypto from "crypto";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Signs a revalidation payload with HMAC-SHA256.
 *
 * The portal verifies this with a timing-safe compare before honouring an on-demand
 * revalidation, so only this service (which holds CMS_REVALIDATE_SECRET) can invalidate
 * its cache. Exported for unit testing.
 */
export function signRevalidationPayload(body: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

/**
 * Fires a best-effort, signed revalidation webhook to the portal after a CMS change.
 *
 * Fire-and-forget: a CMS write must not fail because the portal is briefly unreachable, so
 * failures are logged and swallowed. No-ops (with a debug log) when the URL or secret is
 * unset, which is the case in local/dev and test.
 */
export async function fireRevalidation(tags: string[]): Promise<void> {
  const url = env.portalRevalidateUrl;
  const secret = env.cmsRevalidateSecret;
  if (!url || !secret) {
    logger.debug?.("[cms] revalidation skipped: PORTAL_REVALIDATE_URL / CMS_REVALIDATE_SECRET not set");
    return;
  }

  const body = JSON.stringify({ tags, at: new Date().toISOString() });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cms-signature": signRevalidationPayload(body, secret),
      },
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      logger.warn?.(`[cms] revalidation webhook returned ${response.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn?.(`[cms] revalidation webhook failed: ${message}`);
  }
}
