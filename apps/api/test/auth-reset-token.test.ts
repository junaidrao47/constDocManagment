import jwt from "jsonwebtoken";
import request from "supertest";
import { env } from "../src/config/env";
import { lastEmailTo, outbox } from "./support/email.fake";
import { bearer, mintToken, resetTestState, seedUser, testApp, TEST_PASSWORD } from "./support/harness";

/**
 * The Phase 1 gate condition: "the reset-token leak is gone and covered by a test".
 *
 * The defect was a chain, not a single mistake. `forgot-password` returned a JWT
 * signed with JWT_SECRET; `authenticate` verified with that same secret and never
 * asked what the token was *for*; and `PATCH /api/users/me` accepted any
 * authenticated caller. So knowing an email address was one request away from owning
 * the account. Each test below pins one link of that chain shut, because fixing only
 * the visible symptom — the token in the response body — would have left a reset
 * token still usable as a session credential.
 */

/** The reset link is the only place the token appears, by design. */
function resetTokenFromEmail(address: string): string {
  const message = lastEmailTo(address);

  if (!message) {
    throw new Error(`no email was sent to ${address}`);
  }

  const match = /reset-password\?token=([^\s]+)/.exec(message.text);

  if (!match) {
    throw new Error(`no reset link found in the email to ${address}:\n${message.text}`);
  }

  return decodeURIComponent(match[1]);
}

describe("password reset tokens", () => {
  beforeEach(() => {
    resetTestState();
  });

  it("returns no token in the response and does not confirm the address exists", async () => {
    const user = await seedUser({ email: "known@example.test" });

    const known = await request(testApp()).post("/api/auth/forgot-password").send({ email: user.email });
    const unregistered = await request(testApp())
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.test" });

    expect(known.status).toBe(200);
    expect(unregistered.status).toBe(200);

    // Byte-for-byte identical: anything that differs is an enumeration oracle.
    expect(known.body).toEqual(unregistered.body);
    expect(known.body.data).toEqual({
      sent: true,
      message: "If an account exists for that email, a reset link has been sent.",
    });

    // Nothing token-shaped anywhere in the payload.
    expect(JSON.stringify(known.body).toLowerCase()).not.toContain("token");

    // And only the real account was emailed.
    expect(outbox).toHaveLength(1);
    expect(outbox[0].to).toBe(user.email);
  });

  it("issues an opaque token that is not a JWT and is not accepted as a credential", async () => {
    const user = await seedUser({ email: "opaque@example.test" });

    await request(testApp()).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);

    const token = resetTokenFromEmail(user.email);

    // The old token verified against JWT_SECRET; this one is random bytes.
    expect(() => jwt.verify(token, env.jwtSecret)).toThrow();
    expect(token.split(".")).toHaveLength(1);

    // The heart of the old takeover: reset token used as a bearer token.
    const asCredential = await request(testApp()).get("/api/users/me").set("Authorization", bearer(token));

    expect(asCredential.status).toBe(401);
  });

  it("refuses an access token presented as a reset token", async () => {
    const user = await seedUser({ email: "crossuse@example.test" });
    const accessToken = mintToken(user);

    const response = await request(testApp())
      .post("/api/auth/reset-password")
      .send({ token: accessToken, newPassword: "BrandNewPass1" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Reset token is invalid or has expired");
  });

  it("refuses a token that carries no purpose claim", async () => {
    const user = await seedUser({ email: "legacy@example.test" });

    // What every token looked like before the `typ` claim existed. Signed correctly,
    // unexpired, and still not a session credential.
    const withoutTyp = mintToken(user, { typ: false });

    await request(testApp()).get("/api/users/me").set("Authorization", bearer(withoutTyp)).expect(401);

    // The same user with a proper access token is admitted, so the 401 above is the
    // missing claim and not a broken fixture.
    await request(testApp()).get("/api/users/me").set("Authorization", bearer(mintToken(user))).expect(200);
  });

  it("consumes the reset link exactly once", async () => {
    const user = await seedUser({ email: "single@example.test" });

    await request(testApp()).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);

    const token = resetTokenFromEmail(user.email);

    const first = await request(testApp())
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "BrandNewPass1" });

    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ reset: true });

    const replay = await request(testApp())
      .post("/api/auth/reset-password")
      .send({ token, newPassword: "AnotherPass123" });

    expect(replay.status).toBe(400);

    // The new password is the one that works now.
    await request(testApp())
      .post("/api/auth/login")
      .send({ email: user.email, password: "BrandNewPass1" })
      .expect(200);

    await request(testApp())
      .post("/api/auth/login")
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it("ends sessions that were open before the reset", async () => {
    const user = await seedUser({ email: "sessions@example.test" });

    // Issued five seconds ago: comfortably before the cut-off the reset will set, and
    // outside the same-second window that `iat` truncation deliberately tolerates.
    const openSession = mintToken(user, { issuedAt: Math.floor(Date.now() / 1000) - 5 });

    await request(testApp()).get("/api/users/me").set("Authorization", bearer(openSession)).expect(200);

    await request(testApp()).post("/api/auth/forgot-password").send({ email: user.email }).expect(200);
    await request(testApp())
      .post("/api/auth/reset-password")
      .send({ token: resetTokenFromEmail(user.email), newPassword: "BrandNewPass1" })
      .expect(200);

    // Revoking refresh tokens alone would have left this access token live for the
    // rest of its fifteen minutes.
    const afterReset = await request(testApp()).get("/api/users/me").set("Authorization", bearer(openSession));

    expect(afterReset.status).toBe(401);
  });
});
