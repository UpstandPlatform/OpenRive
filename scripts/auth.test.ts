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

const { resetEnv } = await import('@openrive/shared/env');
resetEnv();

const auth = await import('@openrive/auth');
const { closeDatabase, db, schema } = await import('@openrive/db');
const { eq } = await import('drizzle-orm');

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures++;
};

const api = async () => (await auth.auth()).api;

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

  // --- passwords from the version before Better Auth -----------------------
  // pbkdf2$sha512$210000$<salt>$<hash> for 'legacy-password', as the first
  // release of sign-in stored it
  const legacy = await auth.createAccount({ name: 'Alan', email: 'alan@example.com', role: 'editor' });
  const conn = await db();
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
  await conn.delete(schema.users).where(eq(schema.users.id, legacy.id));
  check((await conn.$count(schema.accounts, eq(schema.accounts.userId, legacy.id))) === 0, 'deleting an account takes its sign-in with it');
} finally {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall auth checks passed');
process.exit(failures ? 1 : 0);
