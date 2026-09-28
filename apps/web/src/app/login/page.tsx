'use client';
// Sign-in for self-hosted OpenRive. The very first account created here becomes
// the administrator; there is no email verification and no sign-up for others —
// an administrator creates the rest from the dashboard.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppHeader';
import { useSession } from '@/lib/client/session';

export default function LoginPage() {
  const router = useRouter();
  const { authEnabled, needsSetup, account, refresh, loaded } = useSession();
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  // already signed in, or this server does not use sign-in at all
  useEffect(() => {
    if (loaded && (!authEnabled || account)) router.replace('/');
  }, [loaded, authEnabled, account, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== confirm) return setError('The passwords do not match');
    setBusy(true);
    try {
      const url = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const payload = needsSetup ? { name, email, password } : { login, password };
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not sign in');
      await refresh();
      router.replace('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-[360px] bg-bg1 border border-line rounded-xl p-6 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <AppIcon size={28} />
          <div>
            <div className="text-[15px] font-semibold">OpenRive</div>
            <div className="text-t2 text-[11px]">{needsSetup ? 'Create the administrator account' : 'Sign in to continue'}</div>
          </div>
        </div>

        {needsSetup ? (
          <>
            <p className="text-t2 text-[11px] leading-snug">
              This server has no accounts yet. The first account is the administrator and can add everyone else.
            </p>
            <label className="flex flex-col gap-1">
              <span className="label">Name</span>
              <input autoFocus required className="field h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Email (optional)</span>
              <input className="field h-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ada@example.com" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Password</span>
              <input required className="field h-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Repeat password</span>
              <input required className="field h-9" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="label">Name or email</span>
              <input autoFocus required className="field h-9" value={login} onChange={(e) => setLogin(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Password</span>
              <input required className="field h-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </>
        )}

        {error && <div className="text-[#ffb4b4] text-[11px]">{error}</div>}

        <button className="btn btn-primary h-9 justify-center mt-1" disabled={busy}>
          {busy ? 'Working…' : needsSetup ? 'Create account and sign in' : 'Sign in'}
        </button>

        {!needsSetup && (
          <p className="text-t3 text-[11px] leading-snug">
            Forgotten the password? An administrator can reset it, or run <code>openrive users password &lt;name&gt;</code> on the server.
          </p>
        )}
      </form>
    </div>
  );
}
