import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `NEXT_OUTPUT=standalone npm run build` produces a self-contained server
  // (used by the Docker image); the default build works with `npm start`.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // the .riv wasm is loaded by the Rive runtime at run time from /public/rive
  poweredByHeader: false,
  // the PostgreSQL driver is loaded at run time only when DATABASE_URL is set
  serverExternalPackages: ['pg'],
};

export default nextConfig;
