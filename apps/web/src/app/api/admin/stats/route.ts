import { authEnabled, listAccounts, listSessions } from '@openrive/auth';
import { describeDatabase, listProjects } from '@openrive/db';
import { env } from '@openrive/shared/env';
import { requireAdmin } from '@/lib/server/auth';
import { handler, json } from '@/lib/server/route';

export const dynamic = 'force-dynamic';

/** Everything the admin dashboard shows at a glance. */
export const GET = handler(async () => {
  const { error } = await requireAdmin();
  if (error) return error;
  const [{ backend, where }, accounts, projects, sessions] = await Promise.all([
    describeDatabase(),
    listAccounts(),
    listProjects(),
    listSessions(),
  ]);
  const settings = env();
  return json({
    database: { backend, where },
    users: {
      total: accounts.length,
      admins: accounts.filter((a) => a.role === 'admin').length,
      editors: accounts.filter((a) => a.role === 'editor').length,
      viewers: accounts.filter((a) => a.role === 'viewer').length,
      disabled: accounts.filter((a) => a.disabled).length,
      withoutPassword: accounts.filter((a) => !a.hasPassword).length,
    },
    projects: {
      total: projects.length,
      updatedToday: projects.filter((p) => Date.now() - p.updatedAt < 24 * 60 * 60 * 1000).length,
      artboards: projects.reduce((n, p) => n + (p.artboards ?? 0), 0),
      animations: projects.reduce((n, p) => n + (p.animations ?? 0), 0),
      stateMachines: projects.reduce((n, p) => n + (p.stateMachines ?? 0), 0),
    },
    sessions: sessions.length,
    server: {
      authEnabled: authEnabled(),
      authMode: settings.OPENRIVE_AUTH,
      sessionDays: settings.OPENRIVE_SESSION_DAYS,
      accessToken: !!settings.OPENRIVE_ACCESS_TOKEN,
      dataDir: settings.OPENRIVE_DATA_DIR,
    },
  });
});
