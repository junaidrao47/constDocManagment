import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost, type PresignedPost } from "@aws-sdk/s3-presigned-post";
import { env } from "../config/env";

const STORAGE_ROOT = path.resolve(process.cwd(), "storage");
const DOCUMENT_ROOT = path.join(STORAGE_ROOT, "documents");
const CATALOG_ROOT = path.join(STORAGE_ROOT, "catalog");

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

/**
 * Bucket for PUBLIC website assets — homepage hero slides and catalog (service/package)
 * images. These are served to anonymous visitors as plain `<img src>` URLs, so the bucket
 * must allow public read. It is deliberately SEPARATE from the private documents bucket
 * (`env.s3Bucket`), which stays locked down and is reached only through presigned URLs.
 * Falls back to the documents bucket when `S3_PUBLIC_BUCKET` is unset, so behaviour is
 * unchanged until the public bucket is provisioned.
 */
function publicImageBucket(): string | undefined {
  return env.s3PublicBucket ?? env.s3Bucket;
}

function isPublicS3Configured(): boolean {
  return Boolean(env.awsRegion && publicImageBucket());
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

function catalogExtension(fileName: string): string {
  return path.extname(fileName).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
}

export function getLocalCatalogPath(key: string): string {
  return path.join(CATALOG_ROOT, key);
}

export async function saveCatalogObject(
  itemId: string,
  entityType: string,
  originalName: string,
  buffer: Buffer,
  contentType: string,
  area: "main" | "gallery",
): Promise<{ key: string; url: string }> {
  const key = `${entityType}s/${itemId}/${area}/${crypto.randomUUID()}${catalogExtension(originalName)}`;

  const bucket = publicImageBucket();
  if (isPublicS3Configured() && bucket) {
    const client = createS3Client();
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }));
    return { key, url: `https://${bucket}.s3.${env.awsRegion}.amazonaws.com/${key}` };
  }

  const filePath = getLocalCatalogPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { key, url: `/api/public/catalog/images/${encodeURIComponent(key)}` };
}

export async function removeCatalogObject(key: string): Promise<void> {
  const bucket = publicImageBucket();
  if (isPublicS3Configured() && bucket) {
    const client = createS3Client();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      // Ignore cleanup errors; a missing object is already the desired end state.
    }
    return;
  }
  try {
    await fs.unlink(getLocalCatalogPath(key));
  } catch {
    // Ignore cleanup errors for missing local files.
  }
}

/** Public prefix for homepage hero images — deliberately separate from the private documents bucket. */
const HERO_PREFIX = "public/hero";

/**
 * Stores a public hero-carousel image.
 *
 * In S3 mode the object goes to the PUBLIC `public/hero/` prefix with a long immutable
 * cache header and a public URL. In local-disk mode it is written under the catalog root
 * so the existing `/api/public/catalog/images/*` route can serve it without a new handler.
 * Keys are random UUIDs so an uploaded name can never collide or traverse.
 */
export async function saveHeroObject(
  originalName: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = `${HERO_PREFIX}/${crypto.randomUUID()}${catalogExtension(originalName)}`;

  const bucket = publicImageBucket();
  if (isPublicS3Configured() && bucket) {
    const client = createS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: `https://${bucket}.s3.${env.awsRegion}.amazonaws.com/${key}` };
  }

  const filePath = getLocalCatalogPath(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { key, url: `/api/public/catalog/images/${encodeURIComponent(key)}` };
}

/** Deletes a stored hero image from the public bucket (or local disk in fallback mode). */
export async function removeHeroObject(key: string): Promise<void> {
  const bucket = publicImageBucket();
  if (isPublicS3Configured() && bucket) {
    const client = createS3Client();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      // Ignore cleanup errors; a missing object is already the desired end state.
    }
    return;
  }
  try {
    await fs.unlink(getLocalCatalogPath(key));
  } catch {
    // Ignore cleanup errors for missing local files.
  }
}

/** Whether the stack is in S3 mode (vs local-disk fallback). Exposed for callers that branch. */
export function isS3Mode(): boolean {
  return isS3Configured() && Boolean(env.s3Bucket);
}

/** Server-side upload of a buffer we already hold (single-call convenience routes). */
export async function putObject(params: { key: string; body: Buffer; contentType?: string }): Promise<void> {
  if (isS3Configured() && env.s3Bucket) {
    const client = createS3Client();
    await client.send(
      new PutObjectCommand({ Bucket: env.s3Bucket, Key: params.key, Body: params.body, ContentType: params.contentType }),
    );
    return;
  }
  await saveLocalDocument(params.body, params.key);
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

export async function getDownloadUrl(params: {
  key: string;
  expiresIn?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
}): Promise<string | null> {
  if (!isS3Configured() || !env.s3Bucket) {
    return null;
  }

  const client = createS3Client();
  const command = new GetObjectCommand({
    Bucket: env.s3Bucket,
    Key: params.key,
    ResponseContentDisposition: params.responseContentDisposition,
    ResponseContentType: params.responseContentType,
  });

  return getSignedUrl(client, command, { expiresIn: params.expiresIn ?? 900 });
}

export interface PresignedUploadPost {
  url: string;
  fields: Record<string, string>;
}

/**
 * A presigned POST (not PUT), so S3 itself enforces an exact Content-Type and a
 * `content-length-range` ceiling at upload time — a presigned PUT can enforce
 * neither. Returns `null` in local mode so the caller falls back to a local URL.
 */
export async function createUploadPost(params: {
  key: string;
  contentType: string;
  maxBytes: number;
}): Promise<PresignedUploadPost | null> {
  if (!isS3Configured() || !env.s3Bucket) {
    return null;
  }

  const client = createS3Client();
  const presigned: PresignedPost = await createPresignedPost(client, {
    Bucket: env.s3Bucket,
    Key: params.key,
    Conditions: [
      ["content-length-range", 1, params.maxBytes],
      ["eq", "$Content-Type", params.contentType],
    ],
    Fields: { "Content-Type": params.contentType },
    Expires: 900,
  });

  return { url: presigned.url, fields: presigned.fields };
}

/** Object size + content type, or null when the object is not present yet. */
export async function headObject(params: { key: string }): Promise<{ size: number; contentType: string | null } | null> {
  if (isS3Configured() && env.s3Bucket) {
    const client = createS3Client();
    try {
      const result = await client.send(new HeadObjectCommand({ Bucket: env.s3Bucket, Key: params.key }));
      return { size: Number(result.ContentLength ?? 0), contentType: result.ContentType ?? null };
    } catch {
      return null;
    }
  }

  try {
    const stat = await fs.stat(getLocalDocumentPath(params.key));
    return { size: stat.size, contentType: null };
  } catch {
    return null;
  }
}

/** The first `end + 1` bytes of an object, for a magic-byte check. */
export async function getObjectRange(params: { key: string; end: number }): Promise<Buffer | null> {
  if (isS3Configured() && env.s3Bucket) {
    const client = createS3Client();
    try {
      const result = await client.send(
        new GetObjectCommand({ Bucket: env.s3Bucket, Key: params.key, Range: `bytes=0-${params.end}` }),
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  try {
    const handle = await fs.open(getLocalDocumentPath(params.key), "r");
    try {
      const buffer = Buffer.alloc(params.end + 1);
      const { bytesRead } = await handle.read(buffer, 0, params.end + 1, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export function buildLocalUploadUrl(documentId: string): string {
  return `${getApiBaseUrl()}/api/documents/${documentId}/upload`;
}

export function buildLocalDownloadUrl(documentId: string): string {
  return `${getApiBaseUrl()}/api/documents/${documentId}/download`;
}

/** Local-mode URL that streams a specific version's bytes (route `/:id/versions/:versionId/download`). */
export function buildLocalVersionDownloadUrl(documentId: string, versionId: string): string {
  return `${getApiBaseUrl()}/api/documents/${documentId}/versions/${versionId}/download`;
}
