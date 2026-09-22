import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `NEXT_OUTPUT=standalone bun run build` produces the self-contained server
  // used by the Docker image and the desktop app.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // the workspace root, so standalone builds trace files across packages
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // workspace packages ship TypeScript sources
  transpilePackages: ['@openrive/rive', '@openrive/shared', '@openrive/ui', '@openrive/db'],
  // native/optional server dependencies must not be bundled
  serverExternalPackages: ['pg', '@electric-sql/pglite'],
  poweredByHeader: false,
};

export default nextConfig;
