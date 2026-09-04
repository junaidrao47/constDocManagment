import "dotenv/config";
import { z } from "zod";

/**
 * Worker runtime configuration.
 *
 * The worker is a separate deployable with its own Docker build context, so it
 * validates its own environment rather than importing the API's config. Required
 * values fail the process at boot instead of surfacing as a silent no-op job.
 */

const EnvSchema = z.object({
  nodeEnv: z.enum(["development", "test", "production"]).default("development"),

  // The worker cannot do anything useful without its queue and data stores.
  databaseUrl: z.string().min(1, "DATABASE_URL is required"),
  redisUrl: z.string().min(1, "REDIS_URL is required"),

  // Optional: S3 backup and SES delivery are skipped when unset.
  awsRegion: z.string().min(1).optional(),
  s3Bucket: z.string().min(1).optional(),
  s3BackupBucket: z.string().min(1).optional(),
  mailFrom: z.string().email().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Treats empty strings as absent, since Compose passes unset vars through as "". */
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const parsed = EnvSchema.safeParse({
  nodeEnv: optional(process.env.NODE_ENV),
  databaseUrl: optional(process.env.DATABASE_URL),
  redisUrl: optional(process.env.REDIS_URL),
  awsRegion: optional(process.env.AWS_REGION),
  s3Bucket: optional(process.env.S3_BUCKET),
  s3BackupBucket: optional(process.env.S3_BACKUP_BUCKET),
  mailFrom: optional(process.env.MAIL_FROM),
});

if (!parsed.success) {
  const ENV_VAR_BY_KEY: Record<string, string> = {
    nodeEnv: "NODE_ENV",
    databaseUrl: "DATABASE_URL",
    redisUrl: "REDIS_URL",
    awsRegion: "AWS_REGION",
    s3Bucket: "S3_BUCKET",
    s3BackupBucket: "S3_BACKUP_BUCKET",
    mailFrom: "MAIL_FROM",
  };

  const details = parsed.error.issues
    .map((issue) => {
      const key = String(issue.path[0] ?? "");
      return `  - ${ENV_VAR_BY_KEY[key] ?? key}: ${issue.message}`;
    })
    .join("\n");

  throw new Error(`Invalid worker environment configuration:\n${details}`);
}

export const env: Env = parsed.data;
