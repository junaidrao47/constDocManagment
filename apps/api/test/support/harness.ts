import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Express } from "express";
import { createApp } from "../../src/app";
import { env } from "../../src/config/env";
import { DocumentStatus } from "../../src/modules/documents/document-status";
import { TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH } from "../../src/modules/auth/token";
import { UserRole } from "../../src/modules/users/user.entity";
import { fakeDb, resetFakeDatabase } from "./database.fake";
import { resetOutbox } from "./email.fake";
import { resetFakeRedis } from "./redis.fake";

/** Shared setup for the API tests: one app instance, seed helpers, token minting. */

export const TEST_PASSWORD = "Sup3rSecret!";

let cachedApp: Express | null = null;

/**
 * The real app, wired exactly as production wires it.
 *
 * Built once per test file. The rate limiters keep their counters for the lifetime of
 * the instance, which is worth knowing when adding tests that deliberately fail
 * authentication: the credential limiter allows ten failures per quarter hour.
 */
export function testApp(): Express {
  cachedApp ??= createApp();
  return cachedApp;
}

export interface SeededUser {
  id: string;
  email: string;
  role: UserRole;
  password: string;
}

export interface SeedUserOptions {
  email?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
  tokensValidFrom?: Date | null;
}

export async function seedUser(options: SeedUserOptions = {}): Promise<SeededUser> {
  const role = options.role ?? UserRole.Customer;
  const password = options.password ?? TEST_PASSWORD;
  const email = (options.email ?? `${role}.${crypto.randomUUID()}@example.test`).toLowerCase();
  const id = crypto.randomUUID();
  const now = new Date();

  // Cost 4 rather than the production 12: these hashes exist to be compared, not to
  // resist an offline attack, and 12 would dominate the suite's runtime.
  fakeDb.users().seed({
    id,
    email,
    name: `${role} user`,
    phone: null,
    passwordHash: await bcrypt.hash(password, 4),
    role,
    isActive: options.isActive ?? true,
    tokensValidFrom: options.tokensValidFrom ?? null,
    createdAt: now,
    updatedAt: now,
  });

  return { id, email, role, password };
}

export interface MintOptions {
  /** Epoch seconds. Defaults to now. */
  issuedAt?: number;
  ttlSeconds?: number;
  /** `false` omits the claim entirely, which is what a pre-`typ` token looked like. */
  typ?: string | false;
  secret?: string;
}

/** Mints a token the way auth.service does, with each field open to tampering. */
export function mintToken(user: { id: string; email: string; role: UserRole }, options: MintOptions = {}): string {
  const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    role: user.role,
    iat: issuedAt,
    exp: issuedAt + (options.ttlSeconds ?? 900),
  };

  if (options.typ !== false) {
    payload.typ = options.typ ?? TOKEN_TYPE_ACCESS;
  }

  return jwt.sign(payload, options.secret ?? env.jwtSecret);
}

export function refreshTokenFor(user: SeededUser): string {
  return mintToken(user, { typ: TOKEN_TYPE_REFRESH, secret: env.jwtRefreshSecret, ttlSeconds: 604800 });
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export interface SeededDocument {
  id: string;
  s3Key: string;
  fileName: string;
}

const writtenFiles: string[] = [];

export function seedDocument(customerId: string, status: DocumentStatus = DocumentStatus.Pending): SeededDocument {
  const id = crypto.randomUUID();
  const s3Key = `documents/${id}.pdf`;
  const fileName = "certificate.pdf";
  const now = new Date();

  fakeDb.documents().seed({
    id,
    customerId,
    serviceId: null,
    fileName,
    s3Key,
    status,
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return { id, s3Key, fileName };
}

/**
 * Puts real bytes where `utils/s3` will look for them.
 *
 * With AWS unconfigured — which is the situation this project is in — the download
 * route falls through to `res.download` on local storage, so the file has to exist
 * for the test to prove anything about who is allowed to read it.
 */
export function writeLocalDocument(s3Key: string, contents: string): string {
  const filePath = path.join(process.cwd(), "storage", "documents", s3Key);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  writtenFiles.push(filePath);

  return filePath;
}

export function resetTestState(): void {
  resetFakeDatabase();
  resetFakeRedis();
  resetOutbox();

  while (writtenFiles.length > 0) {
    const filePath = writtenFiles.pop() as string;

    try {
      fs.rmSync(filePath, { force: true });
    } catch {
      // A leftover temp file is not worth failing a test over.
    }
  }
}
