// openrive: command line tools for OpenRive.
//   npm run cli -- <command>      or, after `npm link`:   openrive <command>
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { outline } from '../src/lib/rive/api';
import { exportRiv, importRiv } from '../src/lib/rive/document';
import { createProject, EXAMPLES, importFile, loadDoc, PROJECT_ROOT, resolveProject, storage, TEMPLATES } from './project-store';

const HELP = `openrive — local Rive (.riv) editor tools

Usage: openrive <command> [options]

Server
  serve [--port 3000] [--host 0.0.0.0] [--dev]   Start the editor (production build unless --dev)
  mcp                                              Start the MCP server (stdio) for AI assistants

Projects
  list                                             List projects
  new <name> [--template <id>]                     Create a project (see: templates)
  templates                                        List starter templates
  import <file.riv...> [--name <name>]             Import .riv files as projects
  export <project> [out.riv]                       Export a project to a .riv file
  info <project | file.riv> [--json]               Show artboards, objects, timelines, state machines
  delete <project>                                 Delete a project
  validate <file.riv...>                           Check files round-trip losslessly through the editor

Users
  users                                            List users
  users add <name> [--role admin|editor|viewer]    Add a user
  users remove <name|id>                           Remove a user (files move to an admin)

Storage
  storage                                          Show which storage backend is in use
  migrate --from <dir|postgres://…> --to <dir|postgres://…>
                                                   Copy all users and projects between stores

Global options
  --data <dir>     Data folder (default: ./data, or OPENRIVE_DATA_DIR)
  --db <url>       Use PostgreSQL (same as DATABASE_URL=postgres://user:pass@host:5432/db)
  --help           Show this help

Projects can be referenced by id or name.`;

function parse(argv: string[]) {
  const pos: string[] = [];
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opts[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) opts[k] = argv[++i];
      else opts[k] = true;
    } else pos.push(a);
  }
  return { pos, opts };
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

function printOutline(o: ReturnType<typeof outline>) {
  for (const ab of o.artboards) {
    console.log(`\nArtboard "${ab.name}" ${ab.width}×${ab.height}  (${ab.id})`);
    const walk = (nodes: Record<string, unknown>[], depth: number) => {
      for (const n of nodes) {
        const extra = [n.fill && `fill ${n.fill}`, n.text !== undefined && `"${n.text}"`].filter(Boolean).join(' ');
        console.log(`${'  '.repeat(depth)}• ${n.name ?? n.type} [${n.type}] at ${n.x},${n.y} ${extra}  (${n.id})`);
        if (Array.isArray(n.children)) walk(n.children as Record<string, unknown>[], depth + 1);
      }
    };
    walk(ab.children as Record<string, unknown>[], 1);
    for (const t of ab.timelines) console.log(`  ▶ timeline "${t.name}" ${t.durationSeconds}s @${t.fps}fps ${t.loop}  keys: ${t.keyed.join(', ') || 'none'}`);
    for (const sm of ab.stateMachines) {
      console.log(`  ◆ state machine "${sm.name}"  inputs: ${sm.inputs.map((i) => `${i.name}:${i.type}`).join(', ') || 'none'}  listeners: ${sm.listeners}`);
      for (const l of sm.layers) console.log(`      layer "${l.name}": ${l.states.map((s) => s.timeline ?? s.type.replace('State', '')).join(' → ')}`);
    }
  }
  if (o.themeColors.length) console.log(`\nTheme colors (${o.themes.find((t) => t.active)?.name}): ${o.themeColors.map((c) => `${c.name} ${c.color}`).join(', ')}`);
}

async function main() {
  const { pos, opts } = parse(process.argv.slice(2));
  if (typeof opts.data === 'string') process.env.OPENRIVE_DATA_DIR = path.resolve(opts.data);
  if (typeof opts.db === 'string') process.env.DATABASE_URL = opts.db;
  const [cmd, ...args] = pos;
  if (!cmd || opts.help || cmd === 'help') {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case 'serve': {
      const port = String(opts.port ?? process.env.PORT ?? 3000);
      const host = String(opts.host ?? process.env.HOST ?? 'localhost');
      const dev = !!opts.dev;
      if (!dev && !existsSync(path.join(PROJECT_ROOT, '.next', 'BUILD_ID'))) {
        console.error('No production build found. Run `npm run build` first, or use `serve --dev`.');
        process.exit(1);
      }
      const nextBin = require.resolve('next/dist/bin/next', { paths: [PROJECT_ROOT] });
      console.log(`Starting OpenRive on http://${host === '0.0.0.0' ? 'localhost' : host}:${port} (data: ${process.env.OPENRIVE_DATA_DIR})`);
      if (host === '0.0.0.0') console.log('Listening on all network interfaces. Set OPENRIVE_ACCESS_TOKEN to require a password.');
      const child = spawn(process.execPath, [nextBin, dev ? 'dev' : 'start', '-p', port, '-H', host], { cwd: PROJECT_ROOT, stdio: 'inherit', env: process.env });
      child.on('exit', (code) => process.exit(code ?? 0));
      return;
    }
    case 'mcp':
      await import('./mcp-server');
      return;
    case 'list': {
      const users = await storage.listUsers();
      const projects = await storage.listProjects();
      if (!projects.length) return console.log('No projects yet. Try: openrive new "My file" --template bouncing-ball');
      console.log(`${pad('ID', 14)}${pad('NAME', 32)}${pad('OWNER', 14)}${pad('UPDATED', 22)}CONTENT`);
      for (const p of projects) {
        const owner = users.find((u) => u.id === p.ownerId)?.name ?? '?';
        console.log(
          `${pad(p.id, 14)}${pad(p.name, 32)}${pad(owner, 14)}${pad(new Date(p.updatedAt).toLocaleString(), 22)}${p.artboards ?? 0} ab, ${p.animations ?? 0} tl, ${p.stateMachines ?? 0} sm`,
        );
      }
      return;
    }
    case 'templates':
      for (const t of TEMPLATES) console.log(`${pad(t.id, 22)}${t.name} — ${t.description}`);
      for (const e of EXAMPLES) console.log(`${pad(e.id, 22)}${e.name} (example file) — ${e.description}`);
      return;
    case 'new': {
      if (!args[0]) throw new Error('Usage: new <name> [--template <id>]');
      const meta = await createProject(args.join(' '), typeof opts.template === 'string' ? opts.template : 'blank');
      console.log(`Created "${meta.name}" (${meta.id})\nOpen: http://localhost:${process.env.PORT ?? 3000}/editor/${meta.id}`);
      return;
    }
    case 'import': {
      if (!args.length) throw new Error('Usage: import <file.riv...>');
      for (const f of args) {
        const meta = await importFile(f, args.length === 1 && typeof opts.name === 'string' ? opts.name : undefined);
        console.log(`Imported ${f} → "${meta.name}" (${meta.id})`);
      }
      return;
    }
    case 'export': {
      if (!args[0]) throw new Error('Usage: export <project> [out.riv]');
      const { meta, doc } = await loadDoc(args[0]);
      const out = args[1] ?? `${meta.name.replace(/[^\w\- ]+/g, '').trim() || meta.id}.riv`;
      const bytes = exportRiv(doc);
      writeFileSync(out, bytes);
      console.log(`Wrote ${out} (${bytes.length} bytes)`);
      return;
    }
    case 'info': {
      if (!args[0]) throw new Error('Usage: info <project | file.riv>');
      const doc = args[0].toLowerCase().endsWith('.riv') && existsSync(args[0]) ? importRiv(new Uint8Array(readFileSync(args[0]))) : (await loadDoc(args[0])).doc;
      const o = outline(doc);
      if (opts.json) console.log(JSON.stringify(o, null, 2));
      else printOutline(o);
      return;
    }
    case 'delete': {
      const meta = await resolveProject(args[0] ?? '');
      await storage.deleteProject(meta.id);
      console.log(`Deleted "${meta.name}" (${meta.id})`);
      return;
    }
    case 'validate': {
      let failed = 0;
      for (const f of args) {
        const bytes = new Uint8Array(readFileSync(f));
        try {
          const out = exportRiv(importRiv(bytes));
          const same = Buffer.from(out).equals(Buffer.from(bytes));
          console.log(`${same ? '✓' : '≈'} ${f}${same ? ' (byte-identical)' : ' (re-encoded differently)'}`);
        } catch (e) {
          failed++;
          console.log(`✗ ${f}: ${(e as Error).message}`);
        }
      }
      if (failed) process.exit(1);
      return;
    }
    case 'users': {
      const users = await storage.listUsers();
      const sub = args[0];
      if (!sub) {
        for (const u of users) console.log(`${pad(u.id, 14)}${pad(u.name, 24)}${u.role}`);
        return;
      }
      if (sub === 'add') {
        const name = args.slice(1).join(' ');
        if (!name) throw new Error('Usage: users add <name> [--role admin|editor|viewer]');
        const role = opts.role === 'admin' || opts.role === 'viewer' ? opts.role : 'editor';
        const colors = ['#7c5cff', '#2bb3ff', '#27c498', '#ffb020', '#ff5c7a', '#ff7a2b'];
        users.push({ id: nanoid(10), name, role, color: colors[users.length % colors.length], createdAt: Date.now() });
        await storage.saveUsers(users);
        console.log(`Added ${name} (${role})`);
        return;
      }
      if (sub === 'remove') {
        const ref = args.slice(1).join(' ');
        const u = users.find((x) => x.id === ref || x.name.toLowerCase() === ref.toLowerCase());
        if (!u) throw new Error(`User "${ref}" not found`);
        const rest = users.filter((x) => x.id !== u.id);
        const heir = rest.find((x) => x.role === 'admin');
        if (!heir) throw new Error('Cannot remove the last admin');
        for (const p of await storage.listProjects()) if (p.ownerId === u.id) await storage.updateProject(p.id, { ownerId: heir.id });
        await storage.saveUsers(rest);
        console.log(`Removed ${u.name}; their files now belong to ${heir.name}`);
        return;
      }
      throw new Error(`Unknown users command "${sub}"`);
    }
    case 'storage': {
      const name = storage.storageName();
      const where = name === 'postgres' ? (process.env.DATABASE_URL || process.env.OPENRIVE_DATABASE_URL || '').replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:***@') : storage.dataDir();
      const [users, projects] = await Promise.all([storage.listUsers(), storage.listProjects()]);
      console.log(`Backend:  ${name}
Location: ${where}
Users:    ${users.length}
Projects: ${projects.length}`);
      return;
    }
    case 'migrate': {
      const from = typeof opts.from === 'string' ? opts.from : process.env.DATABASE_URL ? '' : storage.dataDir();
      const to = typeof opts.to === 'string' ? opts.to : '';
      if (!from || !to) throw new Error('Usage: openrive migrate --from <dir|postgres://…> --to <dir|postgres://…>');
      const src = storage.createDriver(from);
      const dst = storage.createDriver(to);
      try {
        const r = await storage.migrate(src, dst, (m) => console.log(`  ${m}`));
        console.log(`Copied ${r.users} users and ${r.projects} projects to ${dst.name}.`);
      } finally {
        await src.close?.();
        await dst.close?.();
      }
      return;
    }
    default:
      console.error(`Unknown command "${cmd}"\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main()
  .then(() => storage.storage().close?.())
  .catch((e) => {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  });
