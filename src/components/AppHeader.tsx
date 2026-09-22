'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Users } from 'lucide-react';
import { useCurrentUser, useSession } from '@/lib/client/session';
import { ROLE_INFO } from '@/lib/types';
import { Avatar } from './Avatar';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-[13px] text-t0">
      <AppIcon size={24} />
      OpenRive
    </Link>
  );
}

export function UserSwitcher() {
  const { users, switchUser, refresh, loaded } = useSession();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loaded) refresh();
  }, [loaded, refresh]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);
  if (!user) return <div className="w-32 h-7 rounded bg-bg2 animate-pulse" />;
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 h-8 pl-1 pr-2 rounded-md hover:bg-bg3" onClick={() => setOpen(!open)}>
        <Avatar user={user} size={24} />
        <span className="font-medium">{user.name}</span>
        <span className="text-t2">{ROLE_INFO[user.role].label}</span>
        <ChevronDown size={14} className="text-t2" />
      </button>
      {open && (
        <div className="menu absolute right-0 top-10 w-64">
          <div className="px-2.5 py-1.5 label">Switch user (no login needed)</div>
          {users.map((u) => (
            <button
              key={u.id}
              className="menu-item"
              onClick={() => {
                switchUser(u.id);
                setOpen(false);
              }}
            >
              <Avatar user={u} size={20} />
              <span className="flex-1 truncate">{u.name}</span>
              <span className="text-t2 text-[11px]">{ROLE_INFO[u.role].label}</span>
              {u.id === user.id && <Check size={14} />}
            </button>
          ))}
          <div className="menu-sep" />
          <Link href="/users" className="menu-item" onClick={() => setOpen(false)}>
            <Users size={14} /> Manage users
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-3 h-8 inline-flex items-center rounded-md ${path === href ? 'bg-bg3 text-t0' : 'text-t1 hover:text-t0'}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="h-14 flex items-center gap-6 px-5 border-b border-line bg-bg1 sticky top-0 z-20">
      <Logo />
      <nav className="flex items-center gap-1">
        {tab('/', 'Files')}
        {tab('/users', 'Users')}
      </nav>
      <div className="flex-1" />
      <UserSwitcher />
    </header>
  );
}

/** The OpenRive logo (public/logo.svg) on a light badge so the dark letterform stays visible. */
export function AppIcon({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-white shrink-0" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="OpenRive" style={{ width: size * 0.72, height: size * 0.72 }} />
    </span>
  );
}
