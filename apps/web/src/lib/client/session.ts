'use client';
// Who the browser is acting as.
//
// Two modes, decided by the server (/api/auth/session):
//  - sign-in off (local, single user): pick any local user from the header, as
//    OpenRive has always worked
//  - sign-in on (self-hosted): the signed-in account, from a session cookie
import { create } from 'zustand';
import type { ProjectMeta, Role, User } from '@openrive/shared';

const KEY = 'openrive:user';

export interface Account extends User {
  email: string | null;
  disabled: boolean;
  lastLoginAt: number | null;
  hasPassword: boolean;
}

interface SessionState {
  users: User[];
  /** the signed-in account when sign-in is on */
  account: Account | null;
  authEnabled: boolean;
  needsSetup: boolean;
  currentId: string | null;
  loaded: boolean;
  refresh(): Promise<void>;
  switchUser(id: string): void;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  users: [],
  account: null,
  authEnabled: false,
  needsSetup: false,
  currentId: null,
  loaded: false,
  async refresh() {
    const session = (await fetch('/api/auth/session', { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => ({ authEnabled: false, needsSetup: false, user: null }))) as {
      authEnabled: boolean;
      needsSetup: boolean;
      user: Account | null;
    };

    if (session.authEnabled && !session.user) {
      set({ users: [], account: null, authEnabled: true, needsSetup: session.needsSetup, currentId: null, loaded: true });
      return;
    }

    const users: User[] = await fetch('/api/users', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);

    if (session.authEnabled && session.user) {
      set({ users, account: session.user, authEnabled: true, needsSetup: false, currentId: session.user.id, loaded: true });
      return;
    }

    // login-free mode: remember the chosen user in this browser
    let currentId: string | null = null;
    try {
      currentId = localStorage.getItem(KEY);
    } catch {
      currentId = null;
    }
    if (!currentId || !users.some((u) => u.id === currentId)) currentId = users[0]?.id ?? null;
    set({ users, account: null, authEnabled: false, needsSetup: false, currentId, loaded: true });
    if (currentId) get().switchUser(currentId);
  },
  switchUser(id) {
    // with sign-in on, the account comes from the session and cannot be swapped
    if (get().authEnabled) return;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable */
    }
    set({ currentId: id });
  },
  async signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    set({ account: null, currentId: null, users: [] });
    // a full load, so no editor state survives the sign-out
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  },
}));

export function useCurrentUser(): User | null {
  return useSession((s) => s.account ?? s.users.find((u) => u.id === s.currentId) ?? null);
}

/** The signed-in account's role, or the picked local user's role. */
export function useRole(): Role | null {
  return useCurrentUser()?.role ?? null;
}

export function canEdit(user: User | null, project: ProjectMeta | null | undefined): boolean {
  if (!user || !project) return false;
  if (user.role === 'viewer') return false;
  if (user.role === 'admin') return true;
  return project.ownerId === user.id || !!project.sharedWith?.includes(user.id);
}

export function canSee(user: User | null, project: ProjectMeta): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'viewer') return true;
  return project.ownerId === user.id || !!project.sharedWith?.includes(user.id);
}

export const api = {
  async json<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // the session expired or was revoked: back to the sign-in page
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    return data as T;
  },
};
