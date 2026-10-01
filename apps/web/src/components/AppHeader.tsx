'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, LogOut, Shield, Users } from 'lucide-react';
import { useCurrentUser, useSession } from '@/lib/client/session';
import { ROLE_INFO } from '@openrive/shared';
import { Avatar } from './Avatar';
import { HelpMenuItems, UpdateMenuSection, WindowControls } from './desktop';

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-[13px] text-t0">
      <AppIcon size={24} />
      OpenRive
    </Link>
  );
}

export function UserSwitcher() {
  const { users, switchUser, refresh, loaded, authEnabled, signOut } = useSession();
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
          {/* signed in: the account is fixed. login-free: any local user works */}
          {!authEnabled && (
            <>
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
            </>
          )}
          {user.role === 'admin' && (
            <Link href="/admin" className="menu-item" onClick={() => setOpen(false)}>
              <Shield size={14} /> Admin dashboard
            </Link>
          )}
          {!authEnabled && (
            <Link href="/users" className="menu-item" onClick={() => setOpen(false)}>
              <Users size={14} /> Manage users
            </Link>
          )}
          {authEnabled && (
            <button className="menu-item" onClick={() => void signOut()}>
              <LogOut size={14} /> Sign out
            </button>
          )}
          <HelpMenuItems onDone={() => setOpen(false)} />
          <UpdateMenuSection />
        </div>
      )}
    </div>
  );
}

export function AppHeader() {
  const path = usePathname();
  const user = useCurrentUser();
  const authEnabled = useSession((s) => s.authEnabled);
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={`px-3 h-8 inline-flex items-center rounded-md ${path === href ? 'bg-bg3 text-t0' : 'text-t1 hover:text-t0'}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="window-drag h-14 flex items-center gap-6 px-5 border-b border-line bg-bg1 sticky top-0 z-20">
      <Logo />
      <nav className="flex items-center gap-1">
        {tab('/', 'Files')}
        {user?.role === 'admin' ? tab('/admin', 'Admin') : null}
        {!authEnabled && tab('/users', 'Users')}
        <Link
          href="/settings/integrations"
          className={`px-3 h-8 inline-flex items-center gap-1.5 rounded-md ${path.startsWith('/settings/integrations') ? 'bg-bg3 text-t0' : 'text-t1 hover:text-t0'}`}
        >
          <Bot size={14} /> AI &amp; API
        </Link>
      </nav>
      <div className="flex-1" />
      <UserSwitcher />
      <WindowControls />
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
