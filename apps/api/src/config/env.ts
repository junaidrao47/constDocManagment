import { z } from "zod";

const EnvSchema = z.object({
  nodeEnv: z.string().default("development"),
  port: z.coerce.number().int().positive().default(3000),
  apiUrl: z.string().optional(),
  corsOrigin: z.string().optional(),
  databaseUrl: z.string().optional(),
  redisUrl: z.string().optional(),
  awsRegion: z.string().optional(),
  s3Bucket: z.string().optional(),
  s3BackupBucket: z.string().optional(),
  jwtSecret: z.string().optional(),
  jwtRefreshSecret: z.string().optional(),
  jwtExpiresIn: z.string().default("15m"),
  jwtRefreshExpiresIn: z.string().default("7d"),
});

export const env = EnvSchema.parse({
  nodeEnv: process.env.NODE_ENV,
  port: process.env.PORT,
  apiUrl: process.env.API_URL,
  corsOrigin: process.env.CORS_ORIGIN,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  awsRegion: process.env.AWS_REGION,
  s3Bucket: process.env.S3_BUCKET,
  s3BackupBucket: process.env.S3_BACKUP_BUCKET,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
});
