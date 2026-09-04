/**
 * Jest configuration for the API.
 *
 * The suite runs without Postgres, without Redis, and without AWS or SES
 * credentials. That is deliberate: the client cannot verify the AWS and email
 * credentials yet, so the Phase 1 security gate has to be provable on a laptop with
 * nothing running. `moduleNameMapper` swaps the two infrastructure modules for
 * in-memory fakes at require time, which is why no source file needed a test hook
 * added to it.
 *
 * Anything that genuinely needs a live database belongs in a separate integration
 * suite added alongside the worker in Phase 2.
 */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["<rootDir>/test/**/*.test.ts"],

  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        // Full type-aware compilation, not transpile-only: decorator metadata is
        // required, because the entity classes are the keys the fake data source
        // stores rows under.
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },

  // Runs before the module registry is touched, so config/env sees a complete and
  // predictable environment and never reads the developer's real .env file.
  setupFiles: ["<rootDir>/test/support/env.setup.ts"],

  // Any request ending in config/database, config/redis or utils/email resolves to a
  // fake. The patterns are intentionally unanchored so "./config/database" from
  // app.ts and "../../config/database" from a module both match. Email is mapped
  // globally on purpose: no test should be able to reach SES.
  moduleNameMapper: {
    "config/database$": "<rootDir>/test/support/database.fake.ts",
    "config/redis$": "<rootDir>/test/support/redis.fake.ts",
    "utils/email$": "<rootDir>/test/support/email.fake.ts",
  },

  clearMocks: true,
  restoreMocks: true,
  testTimeout: 15000,
};
