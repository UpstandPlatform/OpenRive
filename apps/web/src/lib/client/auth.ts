'use client';
// Better Auth in the browser. It talks to /api/auth, which is the same server
// the editor already uses, so no address to configure.
import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { Auth } from '@openrive/auth';

export const authClient = createAuthClient({
  // role and color live on the account as well, and come back with the session
  plugins: [inferAdditionalFields<Auth>()],
});

/** The readable half of whatever Better Auth reports went wrong. */
export const authError = (error: { message?: string; code?: string } | null | undefined, fallback: string) => error?.message || fallback;
