import path from "path";

/**
 * The environment every test runs against.
 *
 * This file is a `setupFiles` entry, so it executes before the test file — and
 * therefore before `config/env` is imported and validates itself. Both facts matter:
 * env throws at import time when something required is missing, and it parses
 * `process.env` exactly once.
 *
 * DOTENV_CONFIG_PATH is redirected at an empty file so `dotenv/config` inside
 * config/env cannot pull in the developer's real .env. Without that, whether a
 * document download returns bytes or a presigned S3 redirect would depend on whose
 * machine the suite runs on.
 */

process.env.DOTENV_CONFIG_PATH = path.join(__dirname, "test.env");

process.env.NODE_ENV = "test";
process.env.PORT = "3000";

// Present so config/env validates, and never connected to: config/database and
// config/redis are both replaced by in-memory fakes through moduleNameMapper.
process.env.DATABASE_URL = "postgres://unused:unused@127.0.0.1:15432/unused";
process.env.REDIS_URL = "redis://127.0.0.1:16379";

// Distinct values, mirroring the production rule that the two keys must differ so a
// leaked access key cannot mint refresh tokens.
process.env.JWT_SECRET = "test-access-secret-0123456789abcdefghijklmno";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-9876543210zyxwvutsrqpon";
process.env.JWT_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "7d";

process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.WEB_URL = "http://localhost:5173";
process.env.API_URL = "http://127.0.0.1:3000";

/**
 * Cleared, not set.
 *
 * The client has not been able to verify the AWS or SES credentials, so nothing in
 * this suite may depend on them. With these unset, `utils/s3` reports S3 as
 * unconfigured and downloads are served from local storage, and `utils/email`
 * selects its logging transport. Both are the code paths that actually run today.
 */
for (const key of ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET", "S3_BACKUP_BUCKET", "MAIL_FROM"]) {
  delete process.env[key];
}
