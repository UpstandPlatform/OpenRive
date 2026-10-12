'use client';

import { useState } from 'react';
import { AuthCard, AuthField, AuthLink } from '@/components/AuthCard';
import { authClient, authError } from '@/lib/client/auth';

export default function VerifyEmailForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      const { error: failure } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: '/' });
      if (failure) {
        setError(authError(failure, 'Could not send the verification email. Try again shortly.'));
        return;
      }
      setSent(true);
    } catch {
      setError('Could not send the verification email. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Verify your email"
      subtitle="Check your inbox for a link to activate your OpenRive account."
      action={sent ? 'Send another link' : 'Send verification link'}
      submit={submit}
      busy={busy}
      error={error}
      footer={<p>Already verified? <AuthLink href="/login">Sign in</AuthLink>.</p>}
    >
      {sent && <p role="status" className="text-t2 text-[11px] leading-snug">If an account needs verification, we sent a link to that address. Check your spam folder too.</p>}
      <AuthField
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="ada@example.com"
      />
    </AuthCard>
  );
}
