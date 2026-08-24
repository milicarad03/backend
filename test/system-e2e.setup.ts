import { config } from 'dotenv';
import { resolve } from 'node:path';

const environmentPath = resolve(
  __dirname,
  '../.env.test.local',
);

const result = config({
  path: environmentPath,
  override: true,
});

if (result.error) {
  throw new Error(
    `SYSTEM_E2E_ENV_MISSING: Create ${environmentPath} from .env.system-e2e.example.`,
  );
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'SYSTEM_E2E_DATABASE_URL_MISSING: DATABASE_URL must point to iot_test_db.',
  );
}

let databaseName: string;

try {
  databaseName = decodeURIComponent(
    new URL(databaseUrl).pathname.replace(/^\//, ''),
  );
} catch {
  throw new Error(
    'SYSTEM_E2E_DATABASE_URL_INVALID: DATABASE_URL is not a valid PostgreSQL URL.',
  );
}

if (databaseName !== 'iot_test_db') {
  throw new Error(
    `SYSTEM_E2E_DATABASE_BLOCKED: Expected iot_test_db, received ${databaseName || 'an empty database name'}.`,
  );
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'warn';

