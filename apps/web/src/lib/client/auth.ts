'use client';
// Better Auth in the browser. It talks to /api/auth, which is the same server
// the editor already uses, so no address to configure.
import { createAuthClient } from 'better-auth/react';
import { adminClient, inferAdditionalFields, organizationClient } from 'better-auth/client/plugins';
import type { Auth } from '@openrive/auth';

export const authClient = createAuthClient({
  // role and color live on the account as well, and come back with the session
  plugins: [inferAdditionalFields<Auth>(), organizationClient(), adminClient()],
});

/** The readable half of whatever Better Auth reports went wrong. */
export const authError = (error: { message?: string; code?: string } | null | undefined, fallback: string) => error?.message || fallback;

/** Keeps post-auth redirects on this origin; invitation links pass this value. */
export function postAuthPath() {
  const requested = new URLSearchParams(window.location.search).get('next');
  if (!requested) return '/';
  try {
    const url = new URL(requested, window.location.origin);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}
