import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const rootPackage = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as { version?: string };
const appVersion = (process.env.OPENRIVE_VERSION ?? rootPackage.version ?? '0.0.0-dev').replace(/^v/, '');

const nextConfig: NextConfig = {
  // `NEXT_OUTPUT=standalone bun run build` produces the self-contained server
  // used by the Docker image and the desktop app.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // the workspace root, so standalone builds trace files across packages
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // workspace packages ship TypeScript sources
  transpilePackages: ['@openrive/cli', '@openrive/rive', '@openrive/shared', '@openrive/ui', '@openrive/db'],
  // native/optional server dependencies must not be bundled
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
  poweredByHeader: false,
  // Route handlers enforce their own schema-specific limits; this prevents
  // Next's proxy layer from buffering a large valid editor/upload request into
  // an unbounded application body before those checks run.
  experimental: {
    proxyClientMaxBodySize: '192mb',
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
