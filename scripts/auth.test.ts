// Password hashing, sign-in and sessions, against a throwaway database.
//   bun scripts/auth.test.ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = mkdtempSync(path.join(tmpdir(), 'openrive-auth-'));
process.env.OPENRIVE_DATA_DIR = dir;
process.env.OPENRIVE_AUTH = 'on';
delete process.env.DATABASE_URL;

const { resetEnv } = await import('@openrive/shared/env');
resetEnv();

const auth = await import('@openrive/auth');
const { closeDatabase } = await import('@openrive/db');

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures++;
};

try {
  // --- hashing -------------------------------------------------------------
  const hash = await auth.hashPassword('correct horse battery staple');
  check(hash.startsWith('pbkdf2$sha512$'), 'password hashes carry their algorithm and cost');
  check(!hash.includes('correct horse'), 'the password itself is not stored');
  check(await auth.verifyPassword('correct horse battery staple', hash), 'the right password verifies');
  check(!(await auth.verifyPassword('wrong', hash)), 'a wrong password does not');
  check((await auth.hashPassword('same')) !== (await auth.hashPassword('same')), 'each hash is salted differently');
  check(auth.passwordProblem('short') !== null && auth.passwordProblem('longenough') === null, 'short passwords are rejected');

  // --- first admin ---------------------------------------------------------
  check(auth.authEnabled(), 'OPENRIVE_AUTH=on requires sign-in');
  check(await auth.needsSetup(), 'a fresh server needs setup');
  const admin = await auth.createFirstAdmin({ name: 'Ada', email: 'ada@example.com', password: 'first-admin-pw' });
  check(admin.role === 'admin', 'the first account is an administrator');
  check(!(await auth.needsSetup()), 'setup is done afterwards');
  let refused = false;
  try {
    await auth.createFirstAdmin({ name: 'Eve', password: 'another-password' });
  } catch {
    refused = true;
  }
  check(refused, 'a second "first admin" is refused');

  // --- signing in ----------------------------------------------------------
  check(!(await auth.signIn('Ada', 'nope')), 'a wrong password cannot sign in');
  const byName = await auth.signIn('ada', 'first-admin-pw', 'test');
  check(!!byName, 'the name signs in, ignoring case');
  const byEmail = await auth.signIn('ADA@example.com', 'first-admin-pw');
  check(!!byEmail, 'the email signs in too');
  check(!!(await auth.sessionUser(byEmail!.sessionId)), 'a session cookie resolves to its account');
  check(!(await auth.sessionUser('not-a-session')), 'an unknown session does not');

  // --- other accounts ------------------------------------------------------
  const editor = await auth.createAccount({ name: 'Grace', password: 'editor-password', role: 'editor' });
  check(editor.role === 'editor' && editor.hasPassword, 'an administrator can create accounts with a password');
  const noPassword = await auth.createAccount({ name: 'Alan', role: 'viewer' });
  check(!noPassword.hasPassword && !(await auth.signIn('Alan', '')), 'an account without a password cannot sign in');

  const editorSession = await auth.signIn('Grace', 'editor-password');
  check(!!editorSession, 'the editor signs in');
  await auth.updateAccount(editor.id, { password: 'changed-password' });
  check(!(await auth.sessionUser(editorSession!.sessionId)), 'changing a password ends existing sessions');
  check(!!(await auth.signIn('Grace', 'changed-password')), 'the new password works');

  await auth.updateAccount(editor.id, { disabled: true });
  check(!(await auth.signIn('Grace', 'changed-password')), 'a disabled account cannot sign in');

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
  await auth.endSession(byEmail!.sessionId);
  check(!(await auth.sessionUser(byEmail!.sessionId)), 'signing out ends the session');
} finally {
  await closeDatabase();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall auth checks passed');
process.exit(failures ? 1 : 0);
