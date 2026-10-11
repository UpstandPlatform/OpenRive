'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, LoaderCircle, MailCheck } from 'lucide-react';
import { authClient, authError } from '@/lib/client/auth';
import { useSession } from '@/lib/client/session';

type InvitationInfo = { id: string; email: string; role: string; status: string; organizationName: string; expiresAt: Date | string };

export function InviteController({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const session = useSession();
  const { account, loaded, authEnabled, refresh } = session;
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runAction(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : authError(e as { message?: string } | null, fallback));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loaded) void refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    if (!account || !account.emailVerified || !invitationId) return;
    let current = true;
    void authClient.organization.getInvitation({ query: { id: invitationId } })
      .then((result) => {
        if (!current) return;
        if (result.error) setError(authError(result.error, 'This invitation is unavailable or has expired.'));
        else setInvitation(result.data as unknown as InvitationInfo);
      })
      .catch(() => {
        if (current) setError('This invitation is unavailable or has expired.');
      })
    return () => { current = false; };
  }, [account, invitationId]);

  if (!invitationId) return <main className="max-w-xl mx-auto px-6 py-16"><h1 className="text-xl font-semibold">Invitation link is incomplete</h1><p className="text-sm text-t2 mt-2">Ask the workspace owner to send you a new invitation.</p></main>;
  if (!loaded) return <main className="min-h-screen grid place-items-center"><LoaderCircle className="animate-spin text-t2" /></main>;
  if (!authEnabled) return <main className="max-w-xl mx-auto px-6 py-16"><h1 className="text-xl font-semibold">Sign-in is required</h1><p className="text-sm text-t2 mt-2">Workspace invitations are available on shared OpenRive servers with accounts enabled.</p><Link className="btn mt-5 inline-flex" href="/">Go to OpenRive</Link></main>;

  const next = `/invite?id=${encodeURIComponent(invitationId)}`;
  if (!account) return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <section className="panel max-w-md w-full p-6 text-center">
        <Building2 size={26} className="mx-auto text-accent mb-3" />
        <h1 className="text-xl font-semibold">You’re invited to OpenRive</h1>
        <p className="text-sm text-t2 mt-2">Sign in or create an account to review this workspace invitation.</p>
        <div className="flex justify-center gap-2 mt-5"><Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link><Link className="btn" href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link></div>
      </section>
    </main>
  );

  async function sendVerification() {
    const email = account?.email;
    if (!email) return;
    setNotice(null);
    await runAction(async () => {
      const result = await authClient.sendVerificationEmail({ email, callbackURL: next });
      if (result.error) throw result.error;
      setNotice(`Verification link sent to ${email}. Open that email, then return here to accept the invitation.`);
    }, 'Could not send a verification email');
  }

  async function accept() {
    await runAction(async () => {
      const result = await authClient.organization.acceptInvitation({ invitationId });
      if (result.error) throw result.error;
      await refresh();
      router.replace('/settings/workspaces');
    }, 'Could not accept this invitation');
  }

  async function switchAccount() {
    await runAction(async () => {
      const result = await authClient.signOut();
      if (result.error) throw result.error;
      await refresh();
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }, 'Could not switch accounts');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <section className="panel max-w-md w-full p-6">
        <Building2 size={25} className="text-accent mb-3" />
        <h1 className="text-xl font-semibold">Workspace invitation</h1>
        {!error && account.emailVerified && !invitation ? <p className="text-sm text-t2 mt-3">Loading invitation…</p> : invitation && <div className="mt-3 text-sm text-t1">
          <p>You were invited to join <strong>{invitation.organizationName}</strong> as a {invitation.role}.</p>
          <p className="text-xs text-t2 mt-2">Invitation addressed to {invitation.email}. Signed in as {account.email}.</p>
        </div>}
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        {notice && <p role="status" className="mt-4 text-sm text-t1 inline-flex gap-2"><MailCheck size={15} />{notice}</p>}
        {invitation && account.email?.toLowerCase() !== invitation.email.toLowerCase() && <div className="mt-4">
          <p className="text-sm text-t2 mb-3">Sign in with the invited email address to continue.</p>
          <button className="btn" disabled={busy} onClick={() => void switchAccount()}>Switch account</button>
        </div>}
        {!account.emailVerified && !invitation && <p className="mt-4 text-sm text-t2">Verify your email address to review this workspace invitation.</p>}
        {invitation && account.email?.toLowerCase() === invitation.email.toLowerCase() && !account.emailVerified && <div className="mt-5">
          <p className="text-sm text-t2 mb-3">Verify your email address first. This proves that you control the invited address.</p>
          <button className="btn btn-primary" disabled={busy} onClick={() => void sendVerification()}>{busy ? 'Sending…' : 'Send verification email'}</button>
        </div>}
        {invitation && account.email?.toLowerCase() === invitation.email.toLowerCase() && account.emailVerified && <button className="btn btn-primary mt-5" disabled={busy} onClick={() => void accept()}>{busy ? 'Joining…' : `Join ${invitation.organizationName}`}</button>}
      </section>
    </main>
  );
}
