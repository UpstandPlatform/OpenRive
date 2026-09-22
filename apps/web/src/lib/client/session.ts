'use client';
import { create } from 'zustand';
import type { ProjectMeta, User } from '@openrive/shared';

const KEY = 'openrive:user';

interface SessionState {
  users: User[];
  currentId: string | null;
  loaded: boolean;
  refresh(): Promise<void>;
  switchUser(id: string): void;
}

export const useSession = create<SessionState>((set, get) => ({
  users: [],
  currentId: null,
  loaded: false,
  async refresh() {
    const users: User[] = await fetch('/api/users', { cache: 'no-store' }).then((r) => r.json());
    let currentId: string | null = null;
    try {
      currentId = localStorage.getItem(KEY);
    } catch {
      currentId = null;
    }
    if (!currentId || !users.some((u) => u.id === currentId)) currentId = users[0]?.id ?? null;
    set({ users, currentId, loaded: true });
    if (currentId) get().switchUser(currentId);
  },
  switchUser(id) {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* storage unavailable */
    }
    set({ currentId: id });
  },
}));

export function useCurrentUser(): User | null {
  return useSession((s) => s.users.find((u) => u.id === s.currentId) ?? null);
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
    if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    return data as T;
  },
};
