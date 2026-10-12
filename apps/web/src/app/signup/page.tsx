'use client';
// Creating an account on a self-hosted OpenRive. The first one to exist becomes
// the administrator; after that OPENRIVE_SIGNUP decides whether this page is
// open to everyone or account creation belongs to an administrator.
//
// Cloud accounts must confirm their email before OpenRive creates a usable session.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthCard, AuthField, AuthLink } from '@/components/AuthCard';
import { authClient, authError, postAuthPath } from '@/lib/client/auth';
import { useSession } from '@/lib/client/session';

export default function SignUpPage() {
  const router = useRouter();
  const { authEnabled, emailVerificationRequired, canSignUp, needsSetup, account, refresh, loaded } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    if (loaded && (!authEnabled || account)) router.replace(postAuthPath());
  }, [loaded, authEnabled, account, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('The passwords do not match');
    if (password.length < 8) return setError('Use at least 8 characters');
    setBusy(true);
    const { error: failure } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: '/' });
    if (failure) {
      setError(authError(failure, 'Could not create the account'));
      setBusy(false);
      return;
    }
    if (emailVerificationRequired) {
      router.replace(`/verify-email?email=${encodeURIComponent(email.trim())}`);
      return;
    }
    await refresh();
    router.replace(postAuthPath());
  };

  if (loaded && authEnabled && !canSignUp) {
    return (
      <AuthCard
        title="Sign up"
        subtitle="Accounts are created by an administrator"
        action="Back to sign in"
        submit={(e) => {
          e.preventDefault();
          router.replace('/login');
        }}
        footer={<p>An administrator adds accounts from the dashboard, or with `openrive users add` on the server.</p>}
      >
        <p className="text-t2 text-[11px] leading-snug">This server does not take sign-ups.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle={needsSetup ? 'Create the administrator account' : 'Create your account'}
      action={needsSetup ? 'Create account and sign in' : 'Create account'}
      submit={submit}
      busy={busy}
      error={error}
      footer={
        <p>
          Already have an account? <AuthLink href="/login">Sign in</AuthLink>.
        </p>
      }
    >
      {needsSetup && (
        <p className="text-t2 text-[11px] leading-snug">
          This server has no accounts yet. The first one is the administrator and can add everyone else.
        </p>
      )}
      <AuthField label="Name" autoComplete="name" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada" />
      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ada@example.com"
        hint={emailVerificationRequired ? 'We will email you a link to verify this address before you can use OpenRive.' : 'Used to sign in.'}
      />
      <AuthField
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="At least 8 characters"
      />
      <AuthField
        label="Repeat password"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </AuthCard>
  );
}
