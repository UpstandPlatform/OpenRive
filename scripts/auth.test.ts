// Accounts, sign-in and sessions against a throwaway database.
//   bun scripts/auth.test.ts
//
// This drives Better Auth the way the web app does — through its endpoints,
// with cookies — so the adapter, the schema and the hooks are all exercised.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'openrive-auth-'));
process.env.OPENRIVE_DATA_DIR = dir;
process.env.OPENRIVE_AUTH = 'on';
// The production default is intentionally restrictive; this test exercises
// the later-signup role transition explicitly with an open signup policy.
process.env.OPENRIVE_SIGNUP = 'open';
delete process.env.DATABASE_URL;

const { env, resetEnv } = await import('@openrive/shared/env');
resetEnv();

const auth = await import('@openrive/auth');
const { closeDatabase, createProject, db, deleteOrganization, getOrganizationMemberRole, schema, transferOrganizationOwnership, updateOrganizationMemberRole } = await import('@openrive/db');
const { eq } = await import('drizzle-orm');

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures++;
};

const api = async () => (await auth.auth()).api;
const conn = await db();

/** Signs in through the endpoint and returns the cookie header a browser would send. */
async function signIn(email: string, password: string): Promise<Headers | null> {
  const response = await (await api())
    .signInEmail({ body: { email, password }, asResponse: true })
    .catch(() => null);
  if (!response?.ok) return null;
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  return new Headers({ cookie });
}

async function signUp(name: string, email: string, password: string) {
  return (await api()).signUpEmail({ body: { name, email, password }, asResponse: true }).catch((e: Error) => e);
}

try {
  // --- the first account ---------------------------------------------------
  check(auth.authEnabled(), 'OPENRIVE_AUTH=on requires sign-in');
  check(await auth.needsSetup(), 'a fresh server needs setup');

  const created = await signUp('Ada', 'ada@example.com', 'first-admin-pw');
  check(created instanceof Response && created.ok, 'anyone can create the first account');
  const admin = (await auth.listAccounts()).find((a) => a.email === 'ada@example.com')!;
  check(admin?.role === 'admin', 'the first account is an administrator');
  check(!(await auth.needsSetup()), 'setup is done afterwards');
  check(!!admin.color && admin.hasPassword, 'it gets a colour and a password');

  const second = await signUp('Eve', 'eve@example.com', 'second-account-pw');
  const eve = (await auth.listAccounts()).find((a) => a.email === 'eve@example.com');
  check(second instanceof Response && second.ok && eve?.role === 'editor', 'later sign-ups are editors, not administrators');

  const duplicate = await signUp('Ada again', 'ada@example.com', 'another-password');
  check(!(duplicate instanceof Response && duplicate.ok), 'an email can only be used once');

  // --- signing in ----------------------------------------------------------
  check(!(await signIn('ada@example.com', 'nope')), 'a wrong password cannot sign in');
  const session = await signIn('ada@example.com', 'first-admin-pw');
  check(!!session, 'the right password signs in');
  const signedIn = await auth.sessionUser(session!);
  check(signedIn?.id === admin.id && signedIn?.role === 'admin', 'the cookie resolves to the account, with its role');
  check(!(await auth.sessionUser(new Headers({ cookie: 'openrive.session_token=nonsense' }))), 'an unknown session does not');
  check((await auth.getAccount(admin.id))?.lastLoginAt !== null, 'signing in records the time');

  // --- Better Auth workspaces ---------------------------------------------
  const invalidWorkspace = await (await api()).createOrganization({
    body: { name: '   ', slug: 'invalid-workspace' },
    headers: session!,
    asResponse: true,
  }).catch(() => null);
  check(!invalidWorkspace?.ok, 'workspace names are validated at the server boundary');
  const orgResponse = await (await api()).createOrganization({
    body: { name: 'Animation Team', slug: 'animation-team' },
    headers: session!,
    asResponse: true,
  });
  const organization = orgResponse.ok ? await orgResponse.json() as { id: string } : null;
  check(!!organization?.id, 'the Better Auth organization plugin creates a workspace');
  const activeOwner = await auth.sessionUser(session!);
  check(activeOwner?.activeOrganizationId === organization?.id && activeOwner.activeOrganizationRole === 'owner', 'the creator gets owner access in the active workspace');

  const member = (await auth.listAccounts()).find((account) => account.email === 'eve@example.com')!;
  const cannotAddOwner = await (await api()).addMember({ body: { userId: member.id, organizationId: organization!.id, role: 'owner' }, headers: session!, asResponse: true }).catch(() => null);
  const cannotAddAdmin = await (await api()).addMember({ body: { userId: member.id, organizationId: organization!.id, role: 'admin' }, headers: session!, asResponse: true }).catch(() => null);
  check(!cannotAddOwner?.ok && !cannotAddAdmin?.ok, 'workspace owners cannot be minted and administrators must be invited');
  const added = await (await api()).addMember({ body: { userId: member.id, organizationId: organization!.id, role: 'editor' } }).catch(() => null);
  check(!!added, 'a trusted server action can add a member with a workspace role');
  const colleague = await auth.createAccount({ name: 'Lin', email: 'lin@example.com', role: 'editor' });
  const addedColleague = await (await api()).addMember({ body: { userId: colleague.id, organizationId: organization!.id, role: 'editor' } }).catch(() => null);
  check(!!addedColleague, 'a workspace can contain multiple regular members');
  const memberSession = await signIn('eve@example.com', 'second-account-pw');
  const activeResponse = await (await api()).setActiveOrganization({ body: { organizationId: organization!.id }, headers: memberSession!, asResponse: true }).catch(() => null);
  check(!!activeResponse?.ok, 'a workspace member can select their active workspace');
  const activeMember = await auth.sessionUser(memberSession!);
  check(activeMember?.activeOrganizationRole === 'editor', 'the active session resolves the persisted workspace role');

  const workspaceProject = await createProject({ name: 'Team file', ownerId: admin.id, organizationId: organization!.id, doc: '{}', riv: new Uint8Array([1]) });
  check(auth.canSeeProject(activeMember!, workspaceProject), 'workspace editors can see workspace projects');
  check(auth.canEditProject(activeMember!, workspaceProject), 'workspace editors can edit workspace projects');
  check(!auth.canManageProject(activeMember!, workspaceProject), 'workspace editors cannot manage project access');
  check(!auth.canSeeProject(member, workspaceProject), 'an inactive workspace session cannot read workspace files');
  await auth.updateAccount(member.id, { role: 'viewer' });
  const globalViewerWorkspaceEditor = await auth.sessionUser(memberSession!);
  check(globalViewerWorkspaceEditor?.role === 'viewer' && globalViewerWorkspaceEditor.activeOrganizationRole === 'editor', 'account and workspace roles remain independent in the resolved session');
  check(auth.canEditProject(globalViewerWorkspaceEditor!, workspaceProject), 'a global viewer may edit projects where their workspace role is editor');
  check(auth.canCreateProject(globalViewerWorkspaceEditor!), 'a global viewer may create projects in an editor workspace');
  check(!auth.canCreateProject(globalViewerWorkspaceEditor!, null), 'the same account viewer cannot create personal projects');
  await auth.updateAccount(member.id, { role: 'editor' });

  const noMailInvite = await (await api()).createInvitation({
    body: { email: 'new-member@example.com', role: 'editor', organizationId: organization!.id },
    headers: session!,
    asResponse: true,
  }).catch(() => null);
  check(!noMailInvite?.ok, 'invitation creation fails clearly when SMTP is not configured');
  check((await conn.$count(schema.invitations)) === 0, 'failed invitation delivery leaves no pending invitation behind');

  check((await updateOrganizationMemberRole(organization!.id, admin.id, member.id, 'viewer')) === 'updated', 'a workspace owner can change a member role safely');
  check((await updateOrganizationMemberRole(organization!.id, member.id, admin.id, 'editor')) === 'forbidden', 'workspace members cannot change roles through the database access path');
  const viewerSession = await auth.sessionUser(memberSession!);
  check(viewerSession?.activeOrganizationRole === 'viewer', 'role changes are reflected in the active session');
  check(!auth.canEditProject(viewerSession!, workspaceProject), 'workspace viewers cannot edit workspace projects');
  check(auth.canSeeProject(viewerSession!, workspaceProject), 'workspace viewers can view workspace projects');
  check(!auth.canCreateProject(viewerSession!), 'workspace viewers cannot create projects in the selected workspace');
  check(auth.canCreateProject(viewerSession!, null), 'an account editor can still create a personal project while viewing a workspace');
  check((await updateOrganizationMemberRole(organization!.id, admin.id, admin.id, 'editor')) === 'missing', 'the owner cannot be demoted through the member-role helper');
  check(await transferOrganizationOwnership(organization!.id, admin.id, member.id), 'workspace ownership can be transferred atomically');
  check((await getOrganizationMemberRole(organization!.id, admin.id)) === 'admin' && (await getOrganizationMemberRole(organization!.id, member.id)) === 'owner', 'ownership transfer retains an owner and demotes the previous owner');
  check((await updateOrganizationMemberRole(organization!.id, admin.id, colleague.id, 'admin')) === 'forbidden', 'workspace administrators cannot grant administrator access');
  const concurrentTransfers = await Promise.all([
    transferOrganizationOwnership(organization!.id, member.id, admin.id),
    transferOrganizationOwnership(organization!.id, member.id, colleague.id),
  ]);
  const ownerCount = (await conn.select().from(schema.members).where(eq(schema.members.organizationId, organization!.id)))
    .filter((row) => row.role === 'owner').length;
  check(concurrentTransfers.filter(Boolean).length === 1 && ownerCount === 1, 'concurrent transfers cannot create multiple workspace owners');

  const deletableResponse = await (await api()).createOrganization({
    body: { name: 'Temporary Workspace', slug: 'temporary-workspace' }, headers: session!, asResponse: true,
  });
  const deletable = deletableResponse.ok ? await deletableResponse.json() as { id: string } : null;
  const storedWorkspaceFile = await createProject({ name: 'Workspace file', ownerId: admin.id, organizationId: deletable!.id, rivStorageKey: 'workspace/test-file', doc: '{}' });
  const personalFile = await createProject({ name: 'Personal file', ownerId: admin.id, doc: '{}' });
  await conn.insert(schema.invitations).values({
    id: 'delete-workspace-invite', organizationId: deletable!.id, email: 'pending@example.com', role: 'editor', status: 'pending',
    expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), inviterId: admin.id,
  });
  check((await deleteOrganization(deletable!.id, member.id, 'Temporary Workspace')).status === 'forbidden', 'a non-owner cannot delete a workspace');
  check((await deleteOrganization(deletable!.id, admin.id, 'Stale workspace name')).status === 'name-mismatch', 'workspace deletion rejects stale confirmation names');
  const deletion = await deleteOrganization(deletable!.id, admin.id, 'Temporary Workspace');
  check(deletion.status === 'deleted' && deletion.storageKeys[0] === 'workspace/test-file', 'workspace deletion returns cloud asset keys after a successful transaction');
  const remainingWorkspaceProjects = await conn.select().from(schema.projects).where(eq(schema.projects.id, storedWorkspaceFile.id));
  const remainingPersonalProjects = await conn.select().from(schema.projects).where(eq(schema.projects.id, personalFile.id));
  const remainingWorkspaceMembers = await conn.select().from(schema.members).where(eq(schema.members.organizationId, deletable!.id));
  const remainingWorkspaceInvitations = await conn.select().from(schema.invitations).where(eq(schema.invitations.id, 'delete-workspace-invite'));
  check(!remainingWorkspaceProjects.length, 'workspace projects are removed rather than becoming personal files');
  check(!!remainingPersonalProjects.length, 'workspace deletion preserves personal projects');
  check(!remainingWorkspaceMembers.length, 'workspace deletion removes memberships');
  check(!remainingWorkspaceInvitations.length, 'workspace deletion removes pending invitations');
  const activeAfterDeletion = await auth.sessionUser(session!);
  check(activeAfterDeletion?.activeOrganizationId == null, 'deleting the active workspace clears the owner session selection');

  const editorAdminApi = await (await api()).listUsers({ query: { limit: 10 }, headers: memberSession!, asResponse: true }).catch(() => null);
  const adminApi = await (await api()).listUsers({ query: { limit: 10 }, headers: session!, asResponse: true }).catch(() => null);
  check(!editorAdminApi?.ok && !!adminApi?.ok, 'Better Auth admin plugin endpoints remain unavailable to non-admin accounts');

  await conn.insert(schema.invitations).values({
    id: 'verified-email-required', organizationId: organization!.id, email: member.email!, role: 'editor', status: 'pending',
    expiresAt: new Date(Date.now() + 60_000), createdAt: new Date(), inviterId: admin.id,
  });
  const unverifiedDetails = await (await api()).getInvitation({ query: { id: 'verified-email-required' }, headers: memberSession!, asResponse: true }).catch(() => null);
  const unverifiedAccept = await (await api()).acceptInvitation({ body: { invitationId: 'verified-email-required' }, headers: memberSession!, asResponse: true }).catch(() => null);
  check(!unverifiedDetails?.ok && !unverifiedAccept?.ok, 'unverified users cannot inspect or accept invitations by ID');
  check((await conn.select().from(schema.invitations).where(eq(schema.invitations.id, 'verified-email-required')))[0]?.status === 'pending', 'a refused invitation acceptance remains pending');

  // --- passwords from the version before Better Auth -----------------------
  // pbkdf2$sha512$210000$<salt>$<hash> for 'legacy-password', as the first
  // release of sign-in stored it
  const legacy = await auth.createAccount({ name: 'Alan', email: 'alan@example.com', role: 'editor' });
  await conn.insert(schema.accounts).values({
    id: 'legacy-account',
    userId: legacy.id,
    accountId: legacy.id,
    providerId: auth.CREDENTIAL,
    password: 'pbkdf2$sha512$210000$UqD1N3uhm739q7AacyrAig==$BlcaiXL+cgz/8a8XiCGlasZYkmEA453DFKfKAq2lZj8=',
  });
  check(!!(await signIn('alan@example.com', 'legacy-password')), 'a PBKDF2 password from the old sign-in still works');
  check(!(await signIn('alan@example.com', 'wrong')), 'and a wrong one still does not');

  // --- accounts an administrator makes -------------------------------------
  const editor = await auth.createAccount({ name: 'Grace', email: 'grace@example.com', password: 'editor-password', role: 'editor' });
  check(editor.role === 'editor' && editor.hasPassword, 'an administrator can create accounts with a password');
  const noPassword = await auth.createAccount({ name: 'Hedy', role: 'viewer' });
  check(!noPassword.hasPassword && noPassword.email === null, 'an account can exist without a way to sign in');

  const editorSession = await signIn('grace@example.com', 'editor-password');
  check(!!editorSession, 'the editor signs in');
  await auth.updateAccount(editor.id, { password: 'changed-password' });
  check(!(await auth.sessionUser(editorSession!)), 'changing a password ends existing sessions');
  check(!!(await signIn('grace@example.com', 'changed-password')), 'the new password works');

  await auth.updateAccount(editor.id, { disabled: true });
  check(!(await signIn('grace@example.com', 'changed-password')), 'a disabled account cannot sign in');

  // --- who may sign up -----------------------------------------------------
  process.env.OPENRIVE_SIGNUP = 'off';
  resetEnv();
  const refused = await signUp('Mallory', 'mallory@example.com', 'mallory-password');
  check(!(refused instanceof Response && refused.ok), 'OPENRIVE_SIGNUP=off refuses the sign-up page');
  check(!(await auth.listAccounts()).some((a) => a.email === 'mallory@example.com'), 'and no account is left behind');
  process.env.OPENRIVE_SIGNUP = 'open';
  resetEnv();

  // --- optional mail configuration ----------------------------------------
  const savedSmtpUrl = process.env.OPENRIVE_SMTP_URL;
  const savedEmailFrom = process.env.OPENRIVE_EMAIL_FROM;
  process.env.OPENRIVE_SMTP_URL = 'smtp://127.0.0.1:1025';
  delete process.env.OPENRIVE_EMAIL_FROM;
  resetEnv();
  let incompleteMailConfigRejected = false;
  try { env(); } catch { incompleteMailConfigRejected = true; }
  check(incompleteMailConfigRejected, 'SMTP and sender settings must be configured together');
  process.env.OPENRIVE_EMAIL_FROM = 'noreply@example.test';
  resetEnv();
  check(env().OPENRIVE_SMTP_URL === 'smtp://127.0.0.1:1025', 'a paired SMTP transport and sender pass configuration validation');
  if (savedSmtpUrl === undefined) delete process.env.OPENRIVE_SMTP_URL; else process.env.OPENRIVE_SMTP_URL = savedSmtpUrl;
  if (savedEmailFrom === undefined) delete process.env.OPENRIVE_EMAIL_FROM; else process.env.OPENRIVE_EMAIL_FROM = savedEmailFrom;
  resetEnv();

  // --- permissions ---------------------------------------------------------
  const project = { id: 'p1', name: 'File', ownerId: editor.id, createdAt: 0, updatedAt: 0 };
  const viewer = { ...noPassword, role: 'viewer' as const };
  check(auth.canEditProject(admin, project), 'administrators may edit any file');
  check(auth.canEditProject(editor, project), 'owners may edit their own files');
  check(!auth.canEditProject(viewer, project), 'viewers may not edit');
  check(auth.canSeeProject(viewer, project), 'viewers may still look');
  check(!auth.canEditProject({ ...editor, id: 'someone-else' }, project), 'other editors may not edit a file they do not own');
  check(auth.canEditProject({ ...editor, id: 'shared' }, { ...project, sharedWith: ['shared'] }), 'sharing grants editing');

  // --- sessions ------------------------------------------------------------
  const sessions = await auth.listSessions();
  check(sessions.length > 0, 'sessions are listed for the dashboard');
  // signing up signs in as well, so Ada has more than one: end the one this
  // cookie belongs to. Better Auth signs the cookie, so the token is the part
  // before the signature.
  const cookie = decodeURIComponent(session!.get('cookie')!.split('openrive.session_token=')[1]!.split(';')[0]!);
  const [mine] = await conn.select().from(schema.sessions).where(eq(schema.sessions.token, cookie.split('.')[0]!));
  check(!!mine && mine.userId === admin.id, 'the cookie names a session row of that account');
  await auth.endSession(mine!.id);
  check(!(await auth.sessionUser(session!)), 'ending a session signs that browser out');
  await auth.revokeUserSessions(admin.id);
  check(!(await auth.listSessions()).some((s) => s.userId === admin.id), 'and an administrator can end every session of an account');

  // Concurrent role changes must never remove the final global administrator.
  const concurrentAdmin = await auth.createAccount({ name: 'Concurrent Admin', role: 'admin' });
  const concurrentChanges = await Promise.allSettled([
    auth.updateAccount(admin.id, { role: 'editor' }),
    auth.updateAccount(concurrentAdmin.id, { disabled: true }),
  ]);
  const activeAdmins = (await auth.listAccounts()).filter((account) => account.role === 'admin' && !account.disabled);
  check(concurrentChanges.filter((result) => result.status === 'fulfilled').length === 1 && activeAdmins.length === 1, 'concurrent role changes preserve exactly one active administrator');
  let lastAdminDemotionRejected = false;
  try { await auth.updateAccount(activeAdmins[0]!.id, { role: 'editor' }); } catch { lastAdminDemotionRejected = true; }
  check(lastAdminDemotionRejected, 'the last active administrator cannot be demoted by the account update path');
  let lastAdminDeletionRejected = false;
  try { await auth.deleteAccountAndTransferProjects(activeAdmins[0]!.id, admin.id); } catch { lastAdminDeletionRejected = true; }
  check(lastAdminDeletionRejected, 'the last active administrator cannot be deleted by the account transaction');
  await conn.delete(schema.users).where(eq(schema.users.id, legacy.id));
  check((await conn.$count(schema.accounts, eq(schema.accounts.userId, legacy.id))) === 0, 'deleting an account takes its sign-in with it');
} finally {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall auth checks passed');
process.exit(failures ? 1 : 0);
