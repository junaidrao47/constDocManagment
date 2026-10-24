import type { Request, Response } from "express";
import request from "supertest";
import { QueryFailedError } from "typeorm";
import { z } from "zod";
import { errorHandler } from "../src/middleware/errorHandler";
import { bearer, mintToken, resetTestState, seedUser, testApp } from "./support/harness";
import { UserRole } from "../src/modules/users/user.entity";

/**
 * The error contract: every non-2xx response is the one envelope
 *   { success:false, error:{ code, message, details?, requestId } }
 * and nothing leaks a stack or SQL. The HTTP cases cover the paths that are
 * triggerable without a live database; the classification table and the
 * no-leak guarantee are exercised by calling the handler directly.
 */

beforeEach(() => {
  resetTestState();
});

describe("error envelope over HTTP", () => {
  it("returns NOT_FOUND for an unmatched /api route, with a generated request id", async () => {
    const res = await request(testApp()).get("/api/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
    expect(typeof res.body.error.message).toBe("string");
    expect(res.body.error.requestId).toBeTruthy();
    // The id is echoed in the header and matches the one in the body.
    expect(res.headers["x-request-id"]).toBe(res.body.error.requestId);
  });

  it("echoes a sane inbound x-request-id and replaces an invalid one", async () => {
    const good = await request(testApp()).get("/api/does-not-exist").set("x-request-id", "trace-abc_123.9");
    expect(good.body.error.requestId).toBe("trace-abc_123.9");
    expect(good.headers["x-request-id"]).toBe("trace-abc_123.9");

    const bad = await request(testApp())
      .get("/api/does-not-exist")
      .set("x-request-id", "bad id with spaces and <angle>");
    expect(bad.body.error.requestId).not.toBe("bad id with spaces and <angle>");
    expect(bad.body.error.requestId).toBeTruthy();
  });

  it("returns UNAUTHENTICATED when no token is presented", async () => {
    const res = await request(testApp()).get("/api/admin/quotations");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, error: { code: "UNAUTHENTICATED" } });
    expect(res.body.error.requestId).toBeTruthy();
  });

  it("returns FORBIDDEN when the role is wrong", async () => {
    const customer = await seedUser({ role: UserRole.Customer });
    const res = await request(testApp())
      .get("/api/admin/quotations")
      .set("Authorization", bearer(mintToken(customer)));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, error: { code: "FORBIDDEN", message: "Forbidden" } });
  });

  it("returns VALIDATION_FAILED with per-field details", async () => {
    const res = await request(testApp()).post("/api/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    // details carries Zod's per-field errors so a form can show them inline.
    expect(res.body.error.details).toBeDefined();
    expect(res.body.error.details.email ?? res.body.error.details.password).toBeDefined();
  });

  it("returns RATE_LIMITED once the credential limiter trips", async () => {
    // The auth limiter allows 10 failures per 15 minutes per app instance; this file's
    // instance has made a few login attempts above, so loop until the 429 appears.
    let limited: request.Response | null = null;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const res = await request(testApp()).post("/api/auth/login").send({ email: "x@y.z", password: "wrong-pass" });
      if (res.status === 429) {
        limited = res;
        break;
      }
    }

    expect(limited).not.toBeNull();
    expect(limited!.body).toMatchObject({ success: false, error: { code: "RATE_LIMITED" } });
    expect(limited!.body.error.requestId).toBeTruthy();
  });
});

describe("error handler classification (unit)", () => {
  function mockReq(): Request {
    return { requestId: "unit-req-id", method: "GET", originalUrl: "/api/unit" } as unknown as Request;
  }

  interface CapturedRes {
    statusCode: number;
    body: unknown;
    headersSent: boolean;
    status(code: number): CapturedRes;
    json(payload: unknown): CapturedRes;
  }

  function mockRes(): CapturedRes {
    const res: CapturedRes = {
      statusCode: 0,
      body: undefined,
      headersSent: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    return res;
  }

  function envelope(error: unknown): CapturedRes {
    const res = mockRes();
    errorHandler(error, mockReq(), res as unknown as Response, () => undefined);
    return res;
  }

  it("maps a unique violation to CONFLICT without echoing the constraint", () => {
    const driverError = Object.assign(new Error('duplicate key value violates unique constraint "users_email_key"'), {
      code: "23505",
    });
    const res = envelope(new QueryFailedError("INSERT ...", [], driverError));

    expect(res.statusCode).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe("CONFLICT");
    expect(JSON.stringify(res.body)).not.toMatch(/users_email_key|INSERT|constraint/i);
  });

  it("maps a thrown ZodError to VALIDATION_FAILED with details", () => {
    const parsed = z.object({ email: z.string() }).safeParse({});
    const res = envelope(parsed.success ? new Error("unreachable") : parsed.error);

    expect(res.statusCode).toBe(400);
    const body = res.body as { error: { code: string; details?: Record<string, unknown> } };
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details?.email).toBeDefined();
  });

  it("maps malformed JSON to MALFORMED_JSON", () => {
    const res = envelope(Object.assign(new SyntaxError("Unexpected end of JSON input"), { body: "{" }));
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe("MALFORMED_JSON");
  });

  it("maps an unknown error to a generic INTERNAL_ERROR and leaks nothing", () => {
    const secret = new Error("connection to postgres://user:pass@db failed selecting password_hash");
    secret.stack = `${secret.message}\n    at Secret.leak (/app/src/secret.ts:1:1)`;
    const res = envelope(secret);

    expect(res.statusCode).toBe(500);
    const body = res.body as { success: boolean; error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal server error");
    expect(body.error.requestId).toBe("unit-req-id");
    // Neither the message, the stack, nor the SQL/connection string reaches the body.
    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toMatch(/postgres:\/\/|password_hash|secret\.ts|at Secret\.leak/);
  });
});
