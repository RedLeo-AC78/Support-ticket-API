import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test', 'tests/postgres.test.mjs', 'tests/reset-postgres.test.mjs'], {
  env: { ...process.env, RUN_DB_TESTS: '1' }, stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
