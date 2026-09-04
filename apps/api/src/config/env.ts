import "dotenv/config";
import { z } from "zod";

/**
 * Single source of truth for runtime configuration.
 *
 * Everything the API cannot safely run without is required here so that a
 * misconfigured deployment fails immediately at boot with a readable error,
 * instead of surfacing as a confusing 500 on the first login attempt.
 *
 * `dotenv/config` is imported for local runs outside Docker. It never overwrites
 * variables that are already set, so values injected by Docker Compose win.
 */

const DURATION_PATTERN = /^\d+[smhd]$/i;

const durationSchema = (fallback: string) =>
  z
    .string()
    .regex(DURATION_PATTERN, "must be a duration like 15m, 24h, or 7d")
    .default(fallback);

const EnvSchema = z
  .object({
    nodeEnv: z.enum(["development", "test", "production"]).default("development"),
    port: z.coerce.number().int().positive().max(65535).default(3000),
    apiUrl: z.string().url().optional(),
    corsOrigin: z.string().min(1).optional(),

    // Connection strings are required: the API cannot serve traffic without them.
    databaseUrl: z.string().min(1, "DATABASE_URL is required"),
    redisUrl: z.string().min(1, "REDIS_URL is required"),

    // Signing keys are required and must be long enough to be meaningful.
    jwtSecret: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    jwtRefreshSecret: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
    jwtExpiresIn: durationSchema("15m"),
    jwtRefreshExpiresIn: durationSchema("7d"),

    // Optional: S3/SES features degrade gracefully when these are absent.
    awsRegion: z.string().min(1).optional(),
    s3Bucket: z.string().min(1).optional(),
    s3BackupBucket: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.nodeEnv !== "production") {
      return;
    }

    // AGENT.md production checklist: strict CORS. A wildcard in production would
    // let any origin drive authenticated requests, so refuse to boot instead.
    if (!value.corsOrigin || value.corsOrigin === "*") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["corsOrigin"],
        message: "is required in production and cannot be '*'",
      });
    }

    if (value.jwtSecret === value.jwtRefreshSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jwtRefreshSecret"],
        message: "must differ from JWT_SECRET so a leaked access key cannot mint refresh tokens",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Treats empty strings as absent, since Compose passes unset vars through as "". */
function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

const parsed = EnvSchema.safeParse({
  nodeEnv: optional(process.env.NODE_ENV),
  port: optional(process.env.PORT),
  apiUrl: optional(process.env.API_URL),
  corsOrigin: optional(process.env.CORS_ORIGIN),
  databaseUrl: optional(process.env.DATABASE_URL),
  redisUrl: optional(process.env.REDIS_URL),
  jwtSecret: optional(process.env.JWT_SECRET),
  jwtRefreshSecret: optional(process.env.JWT_REFRESH_SECRET),
  jwtExpiresIn: optional(process.env.JWT_EXPIRES_IN),
  jwtRefreshExpiresIn: optional(process.env.JWT_REFRESH_EXPIRES_IN),
  awsRegion: optional(process.env.AWS_REGION),
  s3Bucket: optional(process.env.S3_BUCKET),
  s3BackupBucket: optional(process.env.S3_BACKUP_BUCKET),
});

if (!parsed.success) {
  const ENV_VAR_BY_KEY: Record<string, string> = {
    nodeEnv: "NODE_ENV",
    port: "PORT",
    apiUrl: "API_URL",
    corsOrigin: "CORS_ORIGIN",
    databaseUrl: "DATABASE_URL",
    redisUrl: "REDIS_URL",
    jwtSecret: "JWT_SECRET",
    jwtRefreshSecret: "JWT_REFRESH_SECRET",
    jwtExpiresIn: "JWT_EXPIRES_IN",
    jwtRefreshExpiresIn: "JWT_REFRESH_EXPIRES_IN",
    awsRegion: "AWS_REGION",
    s3Bucket: "S3_BUCKET",
    s3BackupBucket: "S3_BACKUP_BUCKET",
  };

  const details = parsed.error.issues
    .map((issue) => {
      const key = String(issue.path[0] ?? "");
      return `  - ${ENV_VAR_BY_KEY[key] ?? key}: ${issue.message}`;
    })
    .join("\n");

  // Fail fast and loudly. A half-configured API is worse than one that refuses to start.
  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env: Env = parsed.data;

export const isProduction = env.nodeEnv === "production";
