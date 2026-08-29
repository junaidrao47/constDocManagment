import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");
const DOCUMENT_ROOT = path.join(STORAGE_ROOT, "documents");

function getApiBaseUrl(): string {
  return (env.apiUrl ?? `http://localhost:${env.port}`).replace(/\/$/, "");
}

function isS3Configured(): boolean {
  return Boolean(env.awsRegion && env.s3Bucket);
}

function createS3Client(): S3Client {
  if (!env.awsRegion) {
    throw new Error("AWS_REGION is not configured");
  }

  return new S3Client({ region: env.awsRegion });
}

export function createDocumentStorageKey(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "");
  return `documents/${crypto.randomUUID()}${extension}`;
}

export function getLocalDocumentPath(key: string): string {
  return path.join(DOCUMENT_ROOT, key);
}

export async function ensureLocalDocumentStorage(): Promise<void> {
  await fs.mkdir(DOCUMENT_ROOT, { recursive: true });
}

export async function saveLocalDocument(buffer: Buffer, key: string): Promise<string> {
  await ensureLocalDocumentStorage();

  const filePath = getLocalDocumentPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return filePath;
}

export async function removeLocalDocument(key: string): Promise<void> {
  try {
    await fs.unlink(getLocalDocumentPath(key));
  } catch {
    // Ignore cleanup errors for missing local files.
  }
}

export async function getUploadUrl(params: { key: string; contentType?: string }): Promise<string | null> {
  if (!isS3Configured() || !env.s3Bucket) {
    return null;
  }

  const client = createS3Client();
  const command = new PutObjectCommand({
    Bucket: env.s3Bucket,
    Key: params.key,
    ContentType: params.contentType ?? "application/octet-stream",
  });

  return getSignedUrl(client, command, { expiresIn: 900 });
}

export async function getDownloadUrl(params: { key: string }): Promise<string | null> {
  if (!isS3Configured() || !env.s3Bucket) {
    return null;
  }

  const client = createS3Client();
  const command = new GetObjectCommand({
    Bucket: env.s3Bucket,
    Key: params.key,
  });

  return getSignedUrl(client, command, { expiresIn: 900 });
}

export function buildLocalUploadUrl(documentId: string): string {
  return `${getApiBaseUrl()}/api/documents/${documentId}/upload`;
}

export function buildLocalDownloadUrl(documentId: string): string {
  return `${getApiBaseUrl()}/api/documents/${documentId}/download`;
}
