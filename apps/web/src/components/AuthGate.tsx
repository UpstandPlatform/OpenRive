'use client';
// Sends visitors to /login when this server requires a sign-in and nobody is
// signed in. The API enforces the same rules, so this only saves people from
// staring at an empty editor.
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/client/session';

const PUBLIC_PATHS = ['/login', '/signup'];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { loaded, authEnabled, account, refresh } = useSession();

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  const locked = loaded && authEnabled && !account && !isPublic;

  useEffect(() => {
    if (locked) router.replace('/login');
  }, [locked, router]);

  if (locked) return null;
  return <>{children}</>;
}
