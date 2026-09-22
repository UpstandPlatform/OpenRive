'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, FileUp, MoreHorizontal, Pencil, Plus, Search, Share2, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { api, canEdit, canSee, useCurrentUser, useSession } from '@/lib/client/session';
import { createProjectFromDoc, importRivFile } from '@/lib/client/projects';
import { NewFileDialog, TemplateGallery } from '@/components/TemplateGallery';
import type { RiveDoc } from '@/lib/rive/document';
import type { ProjectMeta } from '@/lib/types';

type Filter = 'mine' | 'shared' | 'all';

function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}

export default function Dashboard() {
  const router = useRouter();
  const user = useCurrentUser();
  const users = useSession((s) => s.users);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [filter, setFilter] = useState<Filter>('mine');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [sharing, setSharing] = useState<ProjectMeta | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api.json<ProjectMeta[]>('/api/projects').then(setProjects), []);
  useEffect(() => {
    api.json<ProjectMeta[]>('/api/projects').then(setProjects);
  }, []);
  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const visible = useMemo(() => {
    if (!projects || !user) return [];
    return projects
      .filter((p) => canSee(user, p))
      .filter((p) => {
        if (filter === 'mine') return p.ownerId === user.id;
        if (filter === 'shared') return p.ownerId !== user.id && (p.sharedWith?.includes(user.id) || user.role !== 'editor');
        return true;
      })
      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  }, [projects, user, filter, query]);

  const [showNew, setShowNew] = useState(false);
  const newFile = () => setShowNew(true);
  const createFrom = async (name: string, doc: RiveDoc) => {
    if (!user) return;
    setShowNew(false);
    setBusy(true);
    try {
      const meta = await createProjectFromDoc(name, user.id, doc);
      router.push(`/editor/${meta.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const importFiles = async (files: FileList | File[]) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      let last: ProjectMeta | null = null;
      for (const f of Array.from(files)) {
        if (!f.name.toLowerCase().endsWith('.riv')) {
          throw new Error(
            f.name.toLowerCase().endsWith('.rev')
              ? '.rev files are Rive’s private editor backup format and cannot be opened outside rive.app. Export a .riv from Rive and import that.'
              : `${f.name} is not a .riv file`,
          );
        }
        last = await importRivFile(f, user.id);
      }
      await load();
      if (last && files.length === 1) router.push(`/editor/${last.id}`);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const rename = async (p: ProjectMeta, name: string) => {
    setRenaming(null);
    if (!name.trim() || name === p.name) return;
    await api.json(`/api/projects/${p.id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    load();
  };
  const duplicate = async (p: ProjectMeta) => {
    await api.json(`/api/projects/${p.id}/duplicate`, { method: 'POST', body: JSON.stringify({ ownerId: user?.id }) });
    load();
  };
  const remove = async (p: ProjectMeta) => {
    if (!confirm(`Delete "${p.name}"? This removes it from disk.`)) return;
    await api.json(`/api/projects/${p.id}`, { method: 'DELETE' });
    load();
  };

  const isViewer = user?.role === 'viewer';

  return (
    <div
      className="min-h-full flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isViewer) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!isViewer && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
      }}
    >
      <AppHeader />
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h1 className="text-[20px] font-semibold mr-4">Files</h1>
          <div className="flex bg-bg2 rounded-md p-0.5">
            {(['mine', 'shared', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 h-7 rounded ${filter === f ? 'bg-bg4 text-t0' : 'text-t1'}`}
              >
                {f === 'mine' ? 'My files' : f === 'shared' ? 'Shared with me' : 'All files'}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-t2" />
            <input className="field pl-7 w-56 h-8" placeholder="Search files" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="flex-1" />
          <input
            ref={fileInput}
            type="file"
            accept=".riv"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && importFiles(e.target.files)}
          />
          <button className="btn" disabled={busy || isViewer} onClick={() => fileInput.current?.click()}>
            <FileUp size={14} /> Import .riv
          </button>
          <button className="btn btn-primary" disabled={busy || isViewer} onClick={newFile}>
            <Plus size={14} /> New file
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-md bg-[#3a1f1f] text-[#ffb4b4] flex items-center gap-3">
            <span className="flex-1">{error}</span>
            <button className="text-t1" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        )}
        {isViewer && (
          <div className="mb-4 px-3 py-2 rounded-md bg-bg2 text-t1">
            You are signed in as a viewer: files open read-only and you can preview animations and state machines.
          </div>
        )}

        {!isViewer && filter === 'mine' && !query && <TemplateGallery onCreate={createFrom} disabled={busy} />}
        {projects !== null && <h2 className="text-[14px] font-semibold mb-3">{filter === 'mine' ? 'My files' : filter === 'shared' ? 'Shared with me' : 'All files'}</h2>}

        {projects === null ? (
          <div className="text-t2">Loading…</div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
            {!isViewer && filter === 'mine' && !query && (
              <button
                onClick={newFile}
                disabled={busy}
                className="aspect-[4/3.2] rounded-xl border border-dashed border-line2 hover:border-accent hover:bg-bg1 flex flex-col items-center justify-center gap-2 text-t1"
              >
                <Plus size={28} />
                <span className="font-medium">New file</span>
                <span className="text-t2 text-[11px]">or drop .riv files anywhere</span>
              </button>
            )}
            {visible.map((p) => {
              const owner = users.find((u) => u.id === p.ownerId);
              const editable = canEdit(user, p);
              return (
                <div key={p.id} className="group rounded-xl bg-bg1 border border-line hover:border-line2 overflow-hidden relative">
                  <Link href={`/editor/${p.id}`} className="block aspect-[4/2.6] bg-[#0e0e0e] relative">
                    {p.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnail} alt="" className="absolute inset-0 w-full h-full object-contain" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-t3">No preview</div>
                    )}
                  </Link>
                  <div className="p-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      {renaming === p.id ? (
                        <input
                          autoFocus
                          defaultValue={p.name}
                          className="field"
                          onBlur={(e) => rename(p, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') rename(p, (e.target as HTMLInputElement).value);
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                        />
                      ) : (
                        <Link href={`/editor/${p.id}`} className="block font-medium truncate text-[13px]">
                          {p.name}
                        </Link>
                      )}
                      <div className="text-t2 text-[11px] mt-1 flex items-center gap-1.5">
                        {owner && <Avatar user={owner} size={14} />}
                        <span className="truncate">
                          {owner?.name ?? 'Unknown'} · {timeAgo(p.updatedAt)}
                        </span>
                      </div>
                      <div className="text-t3 text-[11px] mt-1">
                        {p.artboards ?? 0} artboards · {p.animations ?? 0} timelines · {p.stateMachines ?? 0} state machines
                      </div>
                    </div>
                    <button
                      className="icon-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === p.id ? null : p.id);
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                  {menu === p.id && (
                    <div className="menu absolute right-2 bottom-12" onClick={(e) => e.stopPropagation()}>
                      <button className="menu-item" disabled={!editable} onClick={() => (setMenu(null), setRenaming(p.id))}>
                        <Pencil size={14} /> Rename
                      </button>
                      <button className="menu-item" disabled={isViewer} onClick={() => (setMenu(null), duplicate(p))}>
                        <Copy size={14} /> Duplicate
                      </button>
                      <a className="menu-item" href={`/api/projects/${p.id}/riv`} onClick={() => setMenu(null)}>
                        <Download size={14} /> Download .riv
                      </a>
                      <button
                        className="menu-item"
                        disabled={!(user?.role === 'admin' || p.ownerId === user?.id)}
                        onClick={() => (setMenu(null), setSharing(p))}
                      >
                        <Share2 size={14} /> Share with users
                      </button>
                      <div className="menu-sep" />
                      <button
                        className="menu-item"
                        disabled={!(user?.role === 'admin' || p.ownerId === user?.id)}
                        onClick={() => (setMenu(null), remove(p))}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {projects && !visible.length && (filter !== 'mine' || query || isViewer) && (
          <div className="text-t2 mt-10 text-center">No files here yet.</div>
        )}
      </main>

      {showNew && <NewFileDialog onClose={() => setShowNew(false)} onCreate={createFrom} />}
      {sharing && (
        <ShareDialog
          project={sharing}
          onClose={() => setSharing(null)}
          onSaved={() => {
            setSharing(null);
            load();
          }}
        />
      )}

      {dragOver && (
        <div className="fixed inset-0 z-50 bg-[#57a5e0]/10 border-2 border-dashed border-accent flex items-center justify-center pointer-events-none">
          <div className="text-[16px] font-medium bg-bg2 px-5 py-3 rounded-lg">Drop .riv files to import</div>
        </div>
      )}
      {busy && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-bg2 px-5 py-3 rounded-lg">Working…</div>
        </div>
      )}
    </div>
  );
}

function ShareDialog({ project, onClose, onSaved }: { project: ProjectMeta; onClose: () => void; onSaved: () => void }) {
  const users = useSession((s) => s.users);
  const [shared, setShared] = useState<string[]>(project.sharedWith ?? []);
  const save = async () => {
    await api.json(`/api/projects/${project.id}`, { method: 'PUT', body: JSON.stringify({ sharedWith: shared }) });
    onSaved();
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg2 rounded-xl p-5 w-[380px] border border-line2" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[14px] font-semibold mb-1">Share “{project.name}”</h2>
        <p className="text-t2 mb-4">Editors you share with can open and edit this file.</p>
        <div className="flex flex-col gap-1 max-h-72 overflow-auto">
          {users
            .filter((u) => u.id !== project.ownerId)
            .map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg3">
                <input
                  type="checkbox"
                  checked={shared.includes(u.id)}
                  onChange={(e) => setShared(e.target.checked ? [...shared, u.id] : shared.filter((x) => x !== u.id))}
                />
                <Avatar user={u} size={20} />
                <span className="flex-1">{u.name}</span>
                <span className="text-t2">{u.role}</span>
              </label>
            ))}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
