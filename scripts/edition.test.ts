import { env, resetEnv } from '@openrive/shared/env';

const names = [
  'OPENRIVE_EDITION',
  'DATABASE_URL',
  'OPENRIVE_REDIS_URL',
  'OPENRIVE_AUTH',
  'OPENRIVE_AUTH_SECRET',
  'OPENRIVE_URL',
  'OPENRIVE_STORAGE_ENDPOINT',
  'OPENRIVE_STORAGE_BUCKET',
  'OPENRIVE_STORAGE_ACCESS_KEY_ID',
  'OPENRIVE_STORAGE_SECRET_ACCESS_KEY',
  'OPENRIVE_ALLOW_INSECURE_INTERNAL_SERVICES',
  'NODE_ENV',
] as const;
const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(`Edition test failed: ${message}`);
}

try {
  for (const name of names) delete process.env[name];
  process.env.OPENRIVE_EDITION = 'cloud';
  resetEnv();
  let rejected = false;
  try {
    env();
  } catch {
    rejected = true;
  }
  check(rejected, 'cloud must reject missing production dependencies');

  process.env.DATABASE_URL = 'postgres://openrive:openrive@localhost:5432/openrive';
  process.env.OPENRIVE_REDIS_URL = 'redis://localhost:6379';
  process.env.OPENRIVE_AUTH = 'on';
  process.env.OPENRIVE_AUTH_SECRET = 'a'.repeat(32);
  process.env.OPENRIVE_URL = 'https://openrive.example.com';
  process.env.OPENRIVE_STORAGE_ENDPOINT = 'http://minio:9000';
  process.env.OPENRIVE_STORAGE_BUCKET = 'openrive';
  process.env.OPENRIVE_STORAGE_ACCESS_KEY_ID = 'openrive';
  process.env.OPENRIVE_STORAGE_SECRET_ACCESS_KEY = 'a-secret';
  process.env.NODE_ENV = 'production';
  resetEnv();
  let insecureRejected = false;
  try {
    env();
  } catch {
    insecureRejected = true;
  }
  check(insecureRejected, 'cloud production must reject plaintext service URLs without explicit private-network opt-in');

  process.env.OPENRIVE_ALLOW_INSECURE_INTERNAL_SERVICES = 'true';
  resetEnv();
  check(env().OPENRIVE_EDITION === 'cloud', 'valid cloud configuration must resolve cloud edition');

  delete process.env.OPENRIVE_EDITION;
  delete process.env.DATABASE_URL;
  resetEnv();
  check(env().OPENRIVE_EDITION === 'local', 'no database must infer local edition');
  console.log('Edition configuration tests passed');
} finally {
  for (const name of names) {
    const value = saved[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetEnv();
}
