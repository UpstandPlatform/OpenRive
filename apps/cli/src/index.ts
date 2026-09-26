#!/usr/bin/env bun
// openrive — the OpenRive command line tool.
//   openrive            interactive terminal UI (OpenTUI)
//   openrive <command>  scriptable commands (see HELP below)
import { resetEnv } from '@openrive/shared/env';
import * as commands from './commands';
import { storage, StoreError } from './project-store';

const HELP = `openrive — OpenRive command line tools

Usage:
  openrive                                         Interactive terminal UI
  openrive <command> [options]

Server
  serve [--port 3000] [--host 0.0.0.0] [--dev]     Start the editor
  mcp                                              Start the MCP server (stdio) for AI assistants

Projects
  list                                             List projects
  new <name> [--template <id>]                     Create a project (see: templates)
  templates                                        List starter templates and example files
  import <file.riv...> [--name <name>]             Import .riv files as projects
  export <project> [out.riv]                       Export a project to a .riv file
  export <project> [out.zip] --bundle [--cdn]      Export a standalone preview bundle (index.html + index.js)
  info <project | file.riv> [--json]               Show artboards, objects, timelines, state machines
  delete <project>                                 Delete a project
  validate <file.riv...>                           Check files round-trip losslessly

Users
  users                                            List users
  users add <name> [--role admin|editor|viewer]    Add a user
  users remove <name|id>                           Remove a user (files move to an admin)

Database
  db status                                        Show the database in use and what it holds
  db import [dir]                                  Import a legacy data folder (pre-Drizzle file storage)

Global options
  --db <url>       PostgreSQL URL (same as DATABASE_URL); without one an embedded PostgreSQL is used
  --data <dir>     Data folder for the embedded database (default: ./data)
  --help           Show this help

Projects can be referenced by id or name.`;

export function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: commands.Options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value !== undefined) options[key!] = value;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) options[key!] = argv[++i]!;
      else options[key!] = true;
    } else positional.push(arg);
  }
  return { positional, options };
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (typeof options.data === 'string') process.env.OPENRIVE_DATA_DIR = options.data;
  if (typeof options.db === 'string') process.env.DATABASE_URL = options.db;
  resetEnv();

  const [command, ...args] = positional;

  if (options.help || command === 'help') return console.log(HELP);
  if (!command) {
    if (!process.stdout.isTTY) return console.log(HELP);
    const { runTui } = await import('./tui/app');
    return runTui();
  }

  switch (command) {
    case 'serve':
      return commands.serve(options);
    case 'mcp':
      await import('./mcp-server');
      return;
    case 'list':
      return commands.listProjects();
    case 'templates':
      return commands.listTemplates();
    case 'new':
      return commands.newProject(args, options);
    case 'import':
      return commands.importProjects(args, options);
    case 'export':
      return commands.exportProject(args, options);
    case 'info':
      return commands.info(args, options);
    case 'delete':
      return commands.deleteProject(args);
    case 'validate':
      return commands.validate(args);
    case 'users':
      return commands.users(args, options);
    case 'db':
    case 'storage':
      return commands.dbCommand(command === 'storage' ? ['status'] : args);
    default:
      console.error(`Unknown command "${command}"\n`);
      console.log(HELP);
      process.exit(1);
  }
}

main()
  .then(() => storage.closeDatabase())
  .catch(async (e) => {
    console.error(e instanceof StoreError ? `Error: ${e.message}` : `Error: ${(e as Error).message}`);
    await storage.closeDatabase().catch(() => {});
    process.exit(1);
  });
