'use client';
// Admin dashboard for a self-hosted server: what the instance holds, the
// accounts on it, and the sessions currently signed in.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Plus, RefreshCw, Trash2, UserCog } from 'lucide-react';
import { Modal } from '@openrive/ui';
import type { Role } from '@openrive/shared';
import { ROLE_INFO } from '@openrive/shared';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { api, useCurrentUser, useSession, type Account } from '@/lib/client/session';

interface Stats {
  database: { backend: string; where: string };
  users: { total: number; admins: number; editors: number; viewers: number; disabled: number; withoutPassword: number };
  projects: { total: number; updatedToday: number; artboards: number; animations: number; stateMachines: number };
  sessions: number;
  server: { authEnabled: boolean; authMode: string; sessionDays: number; accessToken: boolean; dataDir: string };
}

interface SessionRow {
  id: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  agent: string | null;
}

export default function AdminPage() {
  const router = useRouter();
  const me = useCurrentUser();
  const { loaded, refresh: refreshSession, authEnabled } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const [stats, accounts, sessions] = await Promise.all([
        api.json<Stats>('/api/admin/stats'),
        api.json<Account[]>('/api/admin/users'),
        api.json<SessionRow[]>('/api/admin/sessions'),
      ]);
      return { stats, accounts, sessions, error: null as string | null };
    } catch (e) {
      return { stats: null, accounts: [], sessions: [], error: (e as Error).message };
    }
  }, []);

  const apply = useCallback((data: { stats: Stats | null; accounts: Account[]; sessions: SessionRow[]; error: string | null }) => {
    setStats(data.stats);
    setAccounts(data.accounts);
    setSessions(data.sessions);
    setError(data.error);
  }, []);

  const load = useCallback(async () => apply(await fetchDashboard()), [apply, fetchDashboard]);

  useEffect(() => {
    if (!loaded) void refreshSession();
  }, [loaded, refreshSession]);

  useEffect(() => {
    if (loaded && me && me.role !== 'admin') router.replace('/');
  }, [loaded, me, router]);

  useEffect(() => {
    if (!loaded || me?.role !== 'admin') return;
    let cancelled = false;
    void (async () => {
      const data = await fetchDashboard();
      if (!cancelled) apply(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [loaded, me, fetchDashboard, apply]);

  if (loaded && me && me.role !== 'admin') return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <main className="flex-1 p-6 max-w-[1100px] w-full mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <h1 className="text-[18px] font-semibold flex-1">Admin</h1>
          <button className="btn h-8" onClick={() => void load()}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {error && <div className="px-3 py-2 rounded-md bg-[#3a1f1f] text-[#ffb4b4]">{error}</div>}

        {stats && (
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Users" value={stats.users.total} hint={`${stats.users.admins} admin · ${stats.users.editors} editor · ${stats.users.viewers} viewer`} />
            <Card label="Files" value={stats.projects.total} hint={`${stats.projects.updatedToday} changed today`} />
            <Card
              label="Content"
              value={stats.projects.animations}
              hint={`${stats.projects.artboards} artboards · ${stats.projects.stateMachines} state machines`}
            />
            <Card label="Signed in" value={stats.sessions} hint={`sessions last ${stats.server.sessionDays} days`} />
          </section>
        )}

        {stats && (
          <section className="rounded-lg border border-line bg-bg1 p-4 flex flex-col gap-2">
            <h2 className="panel-title">Server</h2>
            <Line label="Database" value={`${stats.database.backend === 'embedded' ? 'Embedded PostgreSQL (PGlite)' : 'PostgreSQL'} · ${stats.database.where}`} />
            <Line label="Sign-in" value={stats.server.authEnabled ? `Required (OPENRIVE_AUTH=${stats.server.authMode})` : `Off (OPENRIVE_AUTH=${stats.server.authMode})`} />
            <Line label="Access token" value={stats.server.accessToken ? 'Set — every request needs the shared password' : 'Not set'} />
            <Line label="Data folder" value={stats.server.dataDir} />
            {stats.users.withoutPassword > 0 && (
              <p className="text-t3 text-[11px]">
                {stats.users.withoutPassword} account(s) have no password yet and cannot sign in. Set one below.
              </p>
            )}
          </section>
        )}

        <section className="rounded-lg border border-line bg-bg1">
          <div className="flex items-center gap-3 p-4 border-b border-line">
            <h2 className="panel-title flex-1">Accounts</h2>
            <button className="btn btn-primary h-8" onClick={() => setAdding(true)}>
              <Plus size={13} /> New account
            </button>
          </div>
          <div className="divide-y divide-line">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar user={a} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{a.name}</span>
                    {a.id === me?.id && <span className="text-t3 text-[10px]">you</span>}
                    {a.disabled && <span className="text-[10px] text-[#ffb4b4]">disabled</span>}
                    {!a.hasPassword && authEnabled && <span className="text-[10px] text-[#ffcf33]">no password</span>}
                  </div>
                  <div className="text-t3 text-[11px] truncate">
                    {a.email || 'no email'} · {ROLE_INFO[a.role].label}
                    {a.lastLoginAt ? ` · last signed in ${new Date(a.lastLoginAt).toLocaleString()}` : ' · never signed in'}
                  </div>
                </div>
                <button className="btn h-7" onClick={() => setEditing(a)}>
                  <UserCog size={13} /> Manage
                </button>
              </div>
            ))}
            {!accounts.length && <div className="p-4 text-t3">No accounts yet.</div>}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-bg1">
          <div className="flex items-center gap-3 p-4 border-b border-line">
            <h2 className="panel-title flex-1">Sessions</h2>
            <span className="text-t3 text-[11px]">{sessions.length} signed in</span>
          </div>
          <div className="divide-y divide-line">
            {sessions.map((s) => {
              const owner = accounts.find((a) => a.id === s.userId);
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2">
                  <span className="flex-1 truncate">
                    {owner?.name ?? s.userId}
                    <span className="text-t3 text-[11px]"> · {s.agent?.split(')')[0]?.slice(0, 60) ?? 'unknown browser'}</span>
                  </span>
                  <span className="text-t3 text-[11px] shrink-0">until {new Date(s.expiresAt).toLocaleDateString()}</span>
                  <button
                    className="icon-btn"
                    title="Sign this session out"
                    onClick={async () => {
                      await api.json(`/api/admin/sessions?session=${s.id}`, { method: 'DELETE' });
                      void load();
                    }}
                  >
                    <LogOut size={13} />
                  </button>
                </div>
              );
            })}
            {!sessions.length && <div className="p-4 text-t3">Nobody is signed in right now.</div>}
          </div>
        </section>
      </main>

      {adding && (
        <AccountDialog
          title="New account"
          onClose={() => setAdding(false)}
          onSave={async (values) => {
            await api.json('/api/admin/users', { method: 'POST', body: JSON.stringify(values) });
            setAdding(false);
            void load();
          }}
        />
      )}
      {editing && (
        <AccountDialog
          title={`Manage ${editing.name}`}
          account={editing}
          isSelf={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await api.json(`/api/admin/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(values) });
            setEditing(null);
            void load();
          }}
          onDelete={async () => {
            if (!confirm(`Delete ${editing.name}? Their files move to an administrator.`)) return;
            await api.json(`/api/admin/users/${editing.id}`, { method: 'DELETE' });
            setEditing(null);
            void load();
          }}
          onRevoke={async () => {
            await api.json(`/api/admin/sessions?user=${editing.id}`, { method: 'DELETE' });
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg1 p-4">
      <div className="text-t2 text-[11px]">{label}</div>
      <div className="text-[22px] font-semibold leading-tight">{value}</div>
      {hint && <div className="text-t3 text-[11px] mt-0.5">{hint}</div>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="label w-28 shrink-0">{label}</span>
      <span className="text-t1 text-[12px] break-all">{value}</span>
    </div>
  );
}

interface AccountValues {
  name?: string;
  email?: string;
  password?: string;
  role?: Role;
  disabled?: boolean;
}

function AccountDialog({
  title,
  account,
  isSelf,
  onClose,
  onSave,
  onDelete,
  onRevoke,
}: {
  title: string;
  account?: Account;
  isSelf?: boolean;
  onClose: () => void;
  onSave: (values: AccountValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRevoke?: () => Promise<void>;
}) {
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(account?.role ?? 'editor');
  const [disabled, setDisabled] = useState(account?.disabled ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave({ name, email, password: password || undefined, role, disabled });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      width={420}
      onClose={onClose}
      footer={
        <>
          {onDelete && !isSelf && (
            <button className="btn btn-danger mr-auto" onClick={() => void onDelete()}>
              <Trash2 size={13} /> Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="p-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="label">Name</span>
          <input className="field h-8" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Email (optional, used to sign in)</span>
          <input className="field h-8" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">{account ? 'New password (leave empty to keep)' : 'Password'}</span>
          <input className="field h-8" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Role</span>
          <select className="field h-8" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(['admin', 'editor', 'viewer'] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_INFO[r].label} — {ROLE_INFO[r].description}
              </option>
            ))}
          </select>
        </label>
        {account && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={disabled} disabled={isSelf} onChange={(e) => setDisabled(e.target.checked)} />
            <span>Disabled (keeps their files, blocks sign-in)</span>
          </label>
        )}
        {onRevoke && (
          <button className="btn h-7 self-start" onClick={() => void onRevoke()}>
            <KeyRound size={13} /> Sign out everywhere
          </button>
        )}
        {error && <div className="text-[#ffb4b4] text-[11px]">{error}</div>}
      </div>
    </Modal>
  );
}
