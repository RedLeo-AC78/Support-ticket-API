import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/postgres.test.mjs",
    "tests/reset-postgres.test.mjs",
    "tests/hardening-postgres.test.mjs",
    "tests/ai-postgres.test.mjs",
    "tests/audit-invitations.test.mjs",
    "tests/audit-login-quota.test.mjs",
    "tests/audit-ticket-status.test.mjs",
  ],
  {
    env: { ...process.env, RUN_DB_TESTS: "1" },
    stdio: "inherit",
  },
);

process.exitCode = result.status ?? 1;
