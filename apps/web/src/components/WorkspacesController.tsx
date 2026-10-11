'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Crown, LoaderCircle, MailPlus, Plus, RefreshCw, Shield, Trash2, UserRound, Users } from 'lucide-react';
import { authClient, authError } from '@/lib/client/auth';
import { api, useSession } from '@/lib/client/session';

type Organization = { id: string; name: string; slug: string; createdAt: Date | string };
type Member = { id: string; organizationId: string; userId: string; role: string; user?: { name: string; email?: string | null; image?: string | null } };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt: Date | string };
type Role = 'admin' | 'editor' | 'viewer';

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function WorkspacesController() {
  const session = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [details, setDetails] = useState<{ organizationId: string; members: Member[]; invitations: Invitation[] } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('editor');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeOrganizationId = session.account?.activeOrganizationId;
  const accountId = session.account?.id;
  const load = useCallback(async (activeId: string | undefined) => {
    try {
      const result = await authClient.organization.list();
      if (result.error) throw new Error(authError(result.error, 'Could not load workspaces'));
      const rows = (result.data ?? []) as Organization[];
      setOrganizations(rows);
      setSelectedId((current) => rows.some((item) => item.id === current) ? current : (activeId && rows.some((item) => item.id === activeId) ? activeId : null));
    } catch (e) {
      setError(errorMessage(e, 'Could not load workspaces'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetails = useCallback(async (organizationId: string) => {
    const [memberResult, inviteResult] = await Promise.all([
      authClient.organization.listMembers({ query: { organizationId } }),
      authClient.organization.listInvitations({ query: { organizationId } }),
    ]);
    if (memberResult.error) throw new Error(authError(memberResult.error, 'Could not load workspace members'));
    if (inviteResult.error) throw new Error(authError(inviteResult.error, 'Could not load pending invitations'));
    const memberData = memberResult.data as unknown as { members?: Member[] } | Member[] | null;
    const invitationData = inviteResult.data as unknown as Invitation[] | null;
    setDetails({
      organizationId,
      members: Array.isArray(memberData) ? memberData : memberData?.members ?? [],
      invitations: invitationData ?? [],
    });
  }, []);

  useEffect(() => {
    if (!session.loaded || !session.authEnabled || !accountId) return;
    let current = true;
    void authClient.organization.list().then((result) => {
      if (!current) return;
      if (result.error) throw new Error(authError(result.error, 'Could not load workspaces'));
      const rows = (result.data ?? []) as Organization[];
      setOrganizations(rows);
      setSelectedId((selected) => rows.some((item) => item.id === selected) ? selected : (activeOrganizationId && rows.some((item) => item.id === activeOrganizationId) ? activeOrganizationId : null));
    }).catch((e) => {
      if (current) setError(errorMessage(e, 'Could not load workspaces'));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [session.loaded, session.authEnabled, accountId, activeOrganizationId, load]);
  useEffect(() => {
    if (!selectedId) return;
    let current = true;
    const organizationId = selectedId;
    void Promise.all([
      authClient.organization.listMembers({ query: { organizationId } }),
      authClient.organization.listInvitations({ query: { organizationId } }),
    ]).then(([memberResult, inviteResult]) => {
      if (!current) return;
      if (memberResult.error) throw new Error(authError(memberResult.error, 'Could not load workspace members'));
      if (inviteResult.error) throw new Error(authError(inviteResult.error, 'Could not load pending invitations'));
      const memberData = memberResult.data as unknown as { members?: Member[] } | Member[] | null;
      const invitationData = inviteResult.data as unknown as Invitation[] | null;
      setDetails({
        organizationId,
        members: Array.isArray(memberData) ? memberData : memberData?.members ?? [],
        invitations: invitationData ?? [],
      });
    }).catch((e) => {
      if (current) setError(errorMessage(e, 'Could not load workspace details'));
    });
    return () => { current = false; };
  }, [selectedId]);

  const members = details?.organizationId === selectedId ? details.members : [];
  const invitations = details?.organizationId === selectedId ? details.invitations : [];
  const active = organizations.find((organization) => organization.id === selectedId);
  const currentMember = members.find((member) => member.userId === session.account?.id);
  const isOwner = currentMember?.role.split(',').includes('owner') ?? false;
  const canManage = isOwner || currentMember?.role.split(',').includes('admin') === true;

  async function runAction(action: () => Promise<void>, fallback: string, clearNotice = false) {
    setBusy(true);
    setError(null);
    if (clearNotice) setNotice(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(id: string | null) {
    await runAction(async () => {
      const result = await authClient.organization.setActive({ organizationId: id });
      if (result.error) throw new Error(authError(result.error, 'Could not switch workspace'));
      await session.refresh();
      setNotice(id ? 'Workspace selected. New files will be created there.' : 'Personal workspace selected.');
    }, 'Could not switch workspace', true);
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    await runAction(async () => {
      const result = await authClient.organization.create({ name: cleanName, slug: cleanName.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') });
      if (result.error) throw new Error(authError(result.error, 'Could not create workspace'));
      const created = result.data as Organization;
      setName('');
      setNotice('Workspace created. Invite teammates to start collaborating.');
      await session.refresh();
      await load(created.id);
      setSelectedId(created.id);
    }, 'Could not create workspace', true);
  }

  async function renameWorkspace(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !name.trim()) return;
    await runAction(async () => {
      const result = await authClient.organization.update({ data: { name: name.trim() }, organizationId: active.id });
      if (result.error) throw new Error(authError(result.error, 'Could not update workspace'));
      setName(''); setNotice('Workspace name updated.'); await load(activeOrganizationId);
    }, 'Could not update workspace');
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!active || !inviteEmail.trim()) return;
    const email = inviteEmail.trim();
    await runAction(async () => {
      const result = await authClient.organization.inviteMember({
        email,
        // The inferred input type currently falls back to Better Auth's built-in
        // role union; the server registers and validates OpenRive's custom roles.
        role: inviteRole as Parameters<typeof authClient.organization.inviteMember>[0]['role'],
        organizationId: active.id,
      });
      if (result.error) throw new Error(authError(result.error, 'Could not send invitation. Check that email delivery is configured.'));
      setInviteEmail(''); setNotice(`Invitation sent to ${email}.`); await loadDetails(active.id);
    }, 'Could not send invitation. Check that email delivery is configured.', true);
  }

  async function updateRole(member: Member, role: Role) {
    if (!active) return;
    await runAction(async () => {
      await api.json(`/api/workspaces/${active.id}/members`, { method: 'PATCH', body: JSON.stringify({ userId: member.userId, role }) });
      setNotice('Member access updated.'); await loadDetails(active.id);
    }, 'Could not update member role');
  }

  async function removeMember(member: Member) {
    if (!active || !confirm(`Remove ${member.user?.name ?? member.user?.email ?? 'this member'} from ${active.name}?`)) return;
    await runAction(async () => {
      const result = await authClient.organization.removeMember({ memberIdOrEmail: member.id, organizationId: active.id });
      if (result.error) throw new Error(authError(result.error, 'Could not remove member'));
      setNotice('Member removed.'); await loadDetails(active.id);
    }, 'Could not remove member');
  }

  async function cancelInvite(invitationId: string) {
    if (!active) return;
    await runAction(async () => {
      const result = await authClient.organization.cancelInvitation({ invitationId });
      if (result.error) throw new Error(authError(result.error, 'Could not cancel invitation'));
      setNotice('Invitation canceled.'); await loadDetails(active.id);
    }, 'Could not cancel invitation');
  }

  async function transferOwnership(member: Member) {
    if (!active || !confirm(`Transfer ownership of ${active.name} to ${member.user?.name ?? member.user?.email ?? 'this member'}? You will become a workspace administrator.`)) return;
    await runAction(async () => {
      await api.json(`/api/workspaces/${active.id}/ownership`, { method: 'POST', body: JSON.stringify({ userId: member.userId }) });
      setNotice('Workspace ownership transferred.');
      await loadDetails(active.id);
      await session.refresh();
    }, 'Could not transfer ownership');
  }

  if (!session.authEnabled) return (
    <main className="max-w-3xl mx-auto px-6 py-12">
      <h1 className="text-xl font-semibold">Workspaces need accounts</h1>
      <p className="text-t2 mt-2">Enable authentication on a shared OpenRive server to create workspaces and invite members.</p>
    </main>
  );

  return (
    <main className="max-w-5xl w-full mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-7">
        <Building2 size={21} className="text-accent" />
        <div><h1 className="text-xl font-semibold">Workspaces</h1><p className="text-sm text-t2">Organize projects and control teammate access.</p></div>
        <button className="btn ml-auto" disabled={loading || busy} onClick={() => { setLoading(true); setError(null); void load(activeOrganizationId); }} aria-label="Refresh workspaces"><RefreshCw size={14} /></button>
      </div>
      {!session.account && <p className="text-t2">Sign in to manage your workspaces.</p>}
      {error && <div role="alert" className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</div>}
      {notice && <div role="status" className="mb-4 rounded-md border border-line bg-bg2 p-3 text-sm text-t1">{notice}</div>}
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <section className="panel p-3 h-fit">
          <div className="label px-2 pb-2">Your workspaces</div>
          <button className={`menu-item w-full ${selectedId === null ? 'bg-bg3 text-t0' : ''}`} onClick={() => setSelectedId(null)}>
            <UserRound size={15} /><span className="flex-1 text-left">Personal</span>{session.account?.activeOrganizationId ? null : <Check size={14} />}
          </button>
          {organizations.map((organization) => (
            <button key={organization.id} className={`menu-item w-full ${selectedId === organization.id ? 'bg-bg3 text-t0' : ''}`} onClick={() => setSelectedId(organization.id)}>
              <Building2 size={15} /><span className="flex-1 text-left truncate">{organization.name}</span>{session.account?.activeOrganizationId === organization.id && <Check size={14} />}
            </button>
          ))}
          {loading && <div className="flex justify-center py-3"><LoaderCircle size={16} className="animate-spin text-t2" /></div>}
          <form onSubmit={createWorkspace} className="border-t border-line mt-2 pt-3 flex gap-2">
            <input className="field min-w-0 flex-1 h-8" value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace name" maxLength={80} aria-label="New workspace name" />
            <button className="btn btn-primary px-2" disabled={busy || !name.trim()} title="Create workspace"><Plus size={15} /></button>
          </form>
        </section>

        <section className="panel p-5 min-w-0">
          {!active ? <>
            <h2 className="font-semibold">Personal workspace</h2>
            <p className="text-sm text-t2 mt-1 mb-4">Your personal projects stay private unless you share them.</p>
            <button className="btn" disabled={busy || !session.account?.activeOrganizationId} onClick={() => void setActive(null)}>Use personal workspace</button>
          </> : <>
            <div className="flex items-start gap-3 flex-wrap">
              <div className="min-w-0 flex-1"><h2 className="font-semibold text-lg truncate">{active.name}</h2><p className="text-xs text-t2 mt-1">{members.length} {members.length === 1 ? 'member' : 'members'} · {currentMember?.role ?? 'member'}</p></div>
              {session.account?.activeOrganizationId !== active.id && <button className="btn btn-primary" disabled={busy} onClick={() => void setActive(active.id)}>Use this workspace</button>}
            </div>
            {canManage && <form onSubmit={renameWorkspace} className="mt-5 flex gap-2 max-w-lg">
              <input className="field h-9 flex-1" value={name} onChange={(event) => setName(event.target.value)} placeholder={active.name} maxLength={80} aria-label="Workspace name" />
              <button className="btn" disabled={busy || !name.trim()}>Rename</button>
            </form>}
            <div className="border-t border-line my-5" />
            <h3 className="font-medium flex items-center gap-2 mb-3"><Users size={15} /> Members</h3>
            <div className="divide-y divide-line">
              {members.map((member) => {
                const memberIsOwner = member.role.split(',').includes('owner');
                const display = member.user?.name || member.user?.email || 'OpenRive member';
                return <div key={member.id} className="py-3 flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1"><div className="text-sm truncate">{display}{member.userId === session.account?.id ? ' (you)' : ''}</div><div className="text-xs text-t2 truncate">{member.user?.email ?? 'Member'}</div></div>
                  {memberIsOwner ? <span className="text-xs text-t1 inline-flex items-center gap-1"><Crown size={13} /> Owner</span> : canManage ? <>
                    <select className="field h-8" value={member.role as Role} disabled={busy} onChange={(event) => void updateRole(member, event.target.value as Role)} aria-label={`Role for ${display}`}>
                      <option value="admin">Administrator</option><option value="editor">Editor</option><option value="viewer">Viewer</option>
                    </select>
                    {isOwner && <button className="btn" disabled={busy} onClick={() => void transferOwnership(member)} title="Transfer workspace ownership"><Crown size={13} /></button>}
                    <button className="btn btn-danger" disabled={busy} onClick={() => void removeMember(member)} title={`Remove ${display}`}><Trash2 size={13} /></button>
                  </> : <span className="text-xs text-t2">{member.role}</span>}
                </div>;
              })}
            </div>
            {canManage && <>
              <div className="border-t border-line my-5" />
              <h3 className="font-medium flex items-center gap-2 mb-3"><MailPlus size={15} /> Invite a teammate</h3>
              <form onSubmit={invite} className="flex gap-2 flex-wrap">
                <input className="field h-9 flex-1 min-w-[180px]" type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" aria-label="Teammate email" />
                <select className="field h-9" value={inviteRole} onChange={(event) => setInviteRole(event.target.value as Role)} aria-label="Invitation role">
                  <option value="editor">Editor</option><option value="viewer">Viewer</option>{isOwner && <option value="admin">Administrator</option>}
                </select>
                <button className="btn btn-primary" disabled={busy || !inviteEmail.trim()}><MailPlus size={14} /> Send invite</button>
              </form>
              {!invitations.length ? null : <div className="mt-4">
                <h4 className="label mb-2">Pending invitations</h4>
                {invitations.filter((invitation) => invitation.status === 'pending').map((invitation) => <div className="flex items-center gap-2 py-2 text-sm" key={invitation.id}>
                  <span className="flex-1 truncate">{invitation.email}</span><span className="text-xs text-t2">{invitation.role}</span><button className="btn btn-danger" disabled={busy} onClick={() => void cancelInvite(invitation.id)} aria-label={`Cancel invitation for ${invitation.email}`}><Trash2 size={13} /></button>
                </div>)}
              </div>}
            </>}
            {!canManage && <p className="text-xs text-t2 mt-4 inline-flex items-center gap-1"><Shield size={12} /> Workspace administrators manage members and invitations.</p>}
          </>}
        </section>
      </div>
      {busy && <span className="sr-only" role="status">Working</span>}
    </main>
  );
}
