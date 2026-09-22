// The interactive terminal UI (OpenTUI), shown when `openrive` runs with no command.
import { createCliRenderer, type SelectOption } from '@opentui/core';
import { createRoot, useKeyboard } from '@opentui/react';
import type { ProjectMeta, User } from '@openrive/shared';
import { useCallback, useEffect, useState } from 'react';
import { editorUrl } from '../commands';
import { createProject, EXAMPLES, storage, TEMPLATES } from '../project-store';

type Screen = { kind: 'projects' } | { kind: 'new' } | { kind: 'users' } | { kind: 'confirm'; project: ProjectMeta };

const ACCENT = '#7c5cff';
const DIM = '#8a8a99';

function useProjects() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(() => {
    Promise.all([storage.listProjects(), storage.listUsers()])
      .then(([p, u]) => {
        setProjects(p);
        setUsers(u);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(refresh, [refresh]);
  return { projects, users, error, refresh };
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <box style={{ flexDirection: 'row', paddingLeft: 1, paddingRight: 1 }}>
      <text fg={ACCENT} attributes={1}>
        OpenRive
      </text>
      <text fg={DIM}> {subtitle}</text>
    </box>
  );
}

function Footer({ keys }: { keys: string }) {
  return (
    <box style={{ paddingLeft: 1, paddingRight: 1 }}>
      <text fg={DIM}>{keys}</text>
    </box>
  );
}

export function App() {
  const { projects, users, error, refresh } = useProjects();
  const [screen, setScreen] = useState<Screen>({ kind: 'projects' });
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState('');
  const selected = projects[index];

  const run = (label: string, task: Promise<unknown>) => {
    setStatus(`${label}…`);
    task
      .then(() => {
        setStatus(label);
        refresh();
      })
      .catch((e: Error) => setStatus(`Error: ${e.message}`));
  };

  useKeyboard((key) => {
    if (key.name === 'q' || (key.name === 'c' && key.ctrl)) process.exit(0);
    if (screen.kind === 'projects') {
      if (key.name === 'r') refresh();
      if (key.name === 'n') setScreen({ kind: 'new' });
      if (key.name === 'u') setScreen({ kind: 'users' });
      if (key.name === 'd' && selected) setScreen({ kind: 'confirm', project: selected });
      if (key.name === 'o' && selected) setStatus(editorUrl(selected.id));
      if (key.name === 'e' && selected) {
        const file = `${selected.name.replace(/[^\w\- ]+/g, '').trim() || selected.id}.riv`;
        run(
          `Exported ${file}`,
          storage.getProjectRiv(selected.id).then((bytes) => {
            if (!bytes) throw new Error('This project has not been saved yet');
            return Bun.write(file, bytes);
          }),
        );
      }
    } else if (screen.kind === 'confirm') {
      if (key.name === 'y') {
        run(`Deleted "${screen.project.name}"`, storage.deleteProject(screen.project.id));
        setIndex(0);
        setScreen({ kind: 'projects' });
      }
      if (key.name === 'n' || key.name === 'escape') setScreen({ kind: 'projects' });
    } else if (key.name === 'escape') {
      setScreen({ kind: 'projects' });
    }
  });

  if (error) {
    return (
      <box style={{ flexDirection: 'column', padding: 1 }}>
        <Header subtitle="database" />
        <text fg="#ff8f8f">{error}</text>
        <Footer keys="q quit" />
      </box>
    );
  }

  if (screen.kind === 'new') {
    const options: SelectOption[] = [...TEMPLATES, ...EXAMPLES].map((t) => ({
      name: t.name,
      description: t.description,
      value: t.id,
    }));
    return (
      <box style={{ flexDirection: 'column', padding: 1 }}>
        <Header subtitle="new project — pick a template" />
        <select
          style={{ height: Math.min(options.length + 2, 16) }}
          options={options}
          focused
          onSelect={(_index: number, option: SelectOption | null) => {
            if (!option) return;
            run(`Created from ${option.name}`, createProject(option.name, String(option.value)));
            setScreen({ kind: 'projects' });
          }}
        />
        <Footer keys="↑↓ move · enter create · esc back · q quit" />
      </box>
    );
  }

  if (screen.kind === 'users') {
    return (
      <box style={{ flexDirection: 'column', padding: 1 }}>
        <Header subtitle={`users (${users.length})`} />
        {users.map((u) => (
          <text key={u.id}>
            {u.name.padEnd(24)}
            <span style={{ fg: DIM }}>
              {u.role.padEnd(8)}
              {u.id}
            </span>
          </text>
        ))}
        <Footer keys="esc back · q quit" />
      </box>
    );
  }

  if (screen.kind === 'confirm') {
    return (
      <box style={{ flexDirection: 'column', padding: 1 }}>
        <Header subtitle="delete project" />
        <text>
          Delete <span style={{ fg: ACCENT }}>{screen.project.name}</span>? This cannot be undone.
        </text>
        <Footer keys="y delete · n cancel" />
      </box>
    );
  }

  const options: SelectOption[] = projects.map((p) => ({
    name: p.name,
    description: `${p.artboards ?? 0} artboards · ${p.animations ?? 0} timelines · ${p.stateMachines ?? 0} state machines · ${new Date(p.updatedAt).toLocaleString()}`,
    value: p.id,
  }));

  return (
    <box style={{ flexDirection: 'column', padding: 1 }}>
      <Header subtitle={`${projects.length} projects`} />
      {options.length ? (
        <select style={{ height: Math.min(options.length + 2, 18) }} options={options} focused onChange={(i: number) => setIndex(i)} />
      ) : (
        <text fg={DIM}>No projects yet. Press n to create one.</text>
      )}
      {status ? <text fg={ACCENT}>{status}</text> : null}
      <Footer keys="↑↓ select · n new · e export · o editor url · d delete · u users · r refresh · q quit" />
    </box>
  );
}

export async function runTui() {
  const renderer = await createCliRenderer({ exitOnCtrlC: true });
  createRoot(renderer).render(<App />);
}
