import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const backendDirectory = resolve(testDirectory, '..');
const environmentPath = join(
  backendDirectory,
  '.env.test.local',
);

if (!existsSync(environmentPath)) {
  console.error(
    `SYSTEM_E2E_ENV_MISSING: Create ${environmentPath} from .env.system-e2e.example.`,
  );
  process.exit(1);
}

const environmentResult = config({
  path: environmentPath,
  override: true,
});

if (environmentResult.error) {
  console.error(environmentResult.error.message);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error(
    'SYSTEM_E2E_DATABASE_URL_MISSING: DATABASE_URL must point to iot_test_db.',
  );
  process.exit(1);
}

let databaseName = '';

try {
  databaseName = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ''),
  );
} catch {
  console.error(
    'SYSTEM_E2E_DATABASE_URL_INVALID: DATABASE_URL is not a valid PostgreSQL URL.',
  );
  process.exit(1);
}

if (databaseName !== 'iot_test_db') {
  console.error(
    `SYSTEM_E2E_DATABASE_BLOCKED: Refusing to continue with database "${databaseName || '<empty>'}".`,
  );
  process.exit(1);
}

const executableSuffix = process.platform === 'win32' ? '.cmd' : '';

const runLocalBinary = (binary, args) => {
  const binaryPath = join(
    backendDirectory,
    'node_modules',
    '.bin',
    `${binary}${executableSuffix}`,
  );

  if (!existsSync(binaryPath)) {
    console.error(
      `SYSTEM_E2E_BINARY_MISSING: ${binaryPath}. Run npm install in backend first.`,
    );
    process.exit(1);
  }

  const result = spawnSync(binaryPath, args, {
    cwd: backendDirectory,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      COAP_ENABLED: 'false',
    },
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

console.log(
  '[system-e2e] Verified isolated database: iot_test_db',
);
console.log(
  '[system-e2e] Applying existing migrations without running seed...',
);

runLocalBinary('prisma', ['migrate', 'deploy']);

const defaultTestPaths = [
  'test/telemetry-pipeline.system-spec.ts',
  'test/bulk-device-import.system-spec.ts',
];
const requestedTestPaths = process.argv.slice(2);
const testPaths =
  requestedTestPaths.length > 0
    ? requestedTestPaths
    : defaultTestPaths;

for (const testPath of testPaths) {
  if (
    !/^test\/[A-Za-z0-9._-]+\.system-spec\.ts$/.test(testPath) ||
    !existsSync(join(backendDirectory, testPath))
  ) {
    console.error(
      `SYSTEM_E2E_TEST_PATH_INVALID: ${testPath}`,
    );
    process.exit(1);
  }
}

console.log(
  `[system-e2e] Starting: ${testPaths.join(', ')}`,
);

runLocalBinary('jest', [
  '--config',
  './test/jest-system-e2e.json',
  '--runInBand',
  '--detectOpenHandles',
  '--runTestsByPath',
  ...testPaths,
]);
