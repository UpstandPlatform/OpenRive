'use client';
// Signing in to a self-hosted OpenRive: an email and a password, nothing to
// verify by mail. Accounts are created on /signup (the first one runs the
// server) or by an administrator.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthCard, AuthField, AuthLink } from '@/components/AuthCard';
import { authClient, authError } from '@/lib/client/auth';
import { useSession } from '@/lib/client/session';

export default function LoginPage() {
  const router = useRouter();
  const { authEnabled, canSignUp, account, refresh, loaded } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    setBusy(true);
    const { error: failure } = await authClient.signIn.email({ email: email.trim(), password });
    if (failure) {
      // the same message either way, so it never reveals which accounts exist
      setError(authError(failure, 'That email or password is not right'));
      setBusy(false);
      return;
    }
    await refresh();
    router.replace('/');
  };

  return (
    <AuthCard
      title="Sign in"
      subtitle="Sign in to continue"
      action="Sign in"
      submit={submit}
      busy={busy}
      error={error}
      footer={
        <>
          {canSignUp && (
            <p>
              No account yet? <AuthLink href="/signup">Create one</AuthLink>.
            </p>
          )}
          <p>
            Forgotten the password? An administrator can set a new one, or run <code>openrive users password &lt;name&gt;</code> on the
            server.
          </p>
        </>
      }
    >
      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ada@example.com"
      />
      <AuthField
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
    </AuthCard>
  );
}
