import { env } from "../config/env";

/**
 * Where a link inside an email points.
 *
 * WEB_URL when set, otherwise the first configured CORS origin, since that is the
 * browser app in every deployment we control. Never derived from the request's
 * Host or Origin header: an attacker-supplied header would put an attacker-chosen
 * domain into an email the victim has every reason to trust.
 *
 * Shared rather than per-module because three callers need it — the password-reset
 * link, the notification dispatcher, and the document status change — and two of
 * them previously read the WEB_URL environment variable directly. That bypassed the validated
 * config and, with the variable unset, emitted a bare relative path such as
 * "/dashboard/documents" into an email, where it is unclickable.
 */
export function resolveWebUrl(): string | null {
  if (env.webUrl) {
    return env.webUrl.replace(/\/+$/, "");
  }

  const firstOrigin = env.corsOrigin?.split(",")[0]?.trim();

  return firstOrigin && firstOrigin !== "*" ? firstOrigin.replace(/\/+$/, "") : null;
}

/**
 * An absolute URL for `path` on the browser app, or the bare path when no base is
 * configured. Callers get a usable link where one is possible and a recognisably
 * broken one otherwise, rather than silent string concatenation against "".
 */
export function webUrlFor(path: string): string {
  const base = resolveWebUrl();
  const suffix = path.startsWith("/") ? path : `/${path}`;

  return base ? `${base}${suffix}` : suffix;
}
