'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FileImage, Layers, Palette } from 'lucide-react';
import { exportRiv, RiveDoc } from '@openrive/rive/document';
import { artboardPos, prop } from '@openrive/rive/scene';
import { downloadBytes, docStats } from '@/lib/client/projects';
import { parseDoc, stringifyDoc, toBase64 } from '@openrive/shared/serialize';
import { api } from '@/lib/client/session';
import { usePrefs } from '@/lib/client/prefs';
import { useEditor } from '@/lib/store/editor';
import type { ProjectMeta } from '@openrive/shared';
import { TopBar } from './TopBar';
import { Hierarchy } from './Hierarchy';
import { Inspector } from './Inspector';
import { Stage } from './Stage';
import { AnimatePanel } from './Timeline';
import { ShortcutsDialog } from './ShortcutsDialog';
import { PreferencesDialog } from './PreferencesDialog';
import { ThemePanel } from './ThemePanel';
import { Tabs } from '@openrive/ui';
import { ContextMenuHost } from './ContextMenu';
import { AssetsPanel } from './AssetsPanel';
import { CodePanel } from './CodePanel';
import { Toaster } from '@/components/Toaster';
import { toast } from '@/lib/client/toast';
import { imageSizes } from '@openrive/rive/assets';
import { registerImageSizes } from '@openrive/rive/scene';
import { editorHandlers, handleKey } from './actions';

/** updatedAt of the version on disk that this editor last loaded or saved */
let knownUpdatedAt = 0;
/** true while this editor is writing to disk, so the poller ignores our own changes */
let writing = false;
export function setKnownUpdatedAt(t: number) {
  knownUpdatedAt = t;
}

export function Editor() {
  const mode = useEditor((s) => s.mode);
  const version = useEditor((s) => s.version);
  const savedVersion = useEditor((s) => s.savedVersion);
  const readOnly = useEditor((s) => s.readOnly);
  const leftTab = useEditor((s) => s.leftTab);
  const codeOpen = useEditor((s) => s.codeOpen);
  const liveDoc = useEditor((s) => s.doc);
  // Image components only reference file-level assets; keep their sizes known for bounds/hit testing
  if (liveDoc) registerImageSizes(imageSizes(liveDoc));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'shortcuts' | 'prefs' | null>(null);
  const [externalChange, setExternalChange] = useState<ProjectMeta | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => usePrefs.getState().init(), []);

  const save = useCallback(async () => {
    const s = useEditor.getState();
    if (!s.doc || !s.projectId || s.readOnly) return;
    const v = s.version;
    setSaving(true);
    writing = true;
    try {
      const riv = exportRiv(s.doc);
      const meta = await api.json<ProjectMeta>(`/api/projects/${s.projectId}`, {
        method: 'PUT',
        body: JSON.stringify({
          doc: stringifyDoc(s.doc),
          riv: toBase64(riv),
          thumbnail: captureThumbnail(),
          ...docStats(s.doc),
        }),
      });
      knownUpdatedAt = meta.updatedAt;
      useEditor.getState().markSaved(v);
      setSaveError(null);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      writing = false;
      setSaving(false);
    }
  }, []);

  const exportFile = useCallback(() => {
    const s = useEditor.getState();
    if (!s.doc) return;
    downloadBytes(exportRiv(s.doc), `${s.projectName.replace(/[^\w\- ]+/g, '').trim() || 'file'}.riv`);
  }, []);

  // The bundle is built server side from the saved .riv, so save first.
  const exportBundle = useCallback(
    async (runtime: 'offline' | 'cdn' = 'offline') => {
      const s = useEditor.getState();
      if (!s.projectId) return;
      if (s.version !== s.savedVersion && !s.readOnly) await save();
      toast(runtime === 'cdn' ? 'Building preview bundle…' : 'Building preview bundle with the Rive runtime…');
      const a = document.createElement('a');
      a.href = `/api/projects/${s.projectId}/bundle${runtime === 'cdn' ? '?runtime=cdn' : ''}`;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [save],
  );

  const reloadFromDisk = useCallback(async () => {
    const s = useEditor.getState();
    if (!s.projectId) return;
    const res = await fetch(`/api/projects/${s.projectId}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { meta, doc } = parseDoc<{ meta: ProjectMeta; doc: RiveDoc | null }>(await res.text());
    if (!doc) return;
    knownUpdatedAt = meta.updatedAt;
    useEditor.getState().replaceDoc(doc, meta.name);
    setExternalChange(null);
  }, []);

  // register handlers used by actions (menus / shortcuts)
  useEffect(() => {
    editorHandlers.save = save;
    editorHandlers.exportFile = exportFile;
    editorHandlers.exportBundle = exportBundle;
    editorHandlers.openShortcuts = () => setDialog('shortcuts');
    editorHandlers.openPrefs = () => setDialog('prefs');
    editorHandlers.preview = () => {
      const id = useEditor.getState().projectId;
      if (id) window.open(`/preview/${id}`, '_blank');
    };
  }, [save, exportFile, exportBundle]);

  // autosave
  useEffect(() => {
    if (readOnly || version === savedVersion || externalChange) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!useEditor.getState().gestureStart) save();
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [version, savedVersion, readOnly, save, externalChange]);

  // pick up changes made on disk by the CLI, MCP tools or another window
  useEffect(() => {
    const timer = setInterval(async () => {
      const s = useEditor.getState();
      if (!s.projectId || document.hidden || writing) return;
      try {
        const meta = await api.json<ProjectMeta>(`/api/projects/${s.projectId}?meta=1`);
        if (meta.updatedAt <= knownUpdatedAt || writing) return;
        const st = useEditor.getState();
        if (st.version === st.savedVersion && !st.gestureStart) await reloadFromDisk();
        else setExternalChange(meta);
      } catch {
        /* server unavailable: try again next tick */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [reloadFromDisk]);

  // warn on unload with unsaved changes
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.version !== s.savedVersion && !s.readOnly) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      const id = useEditor.getState().projectId;
      if (!id) return;
      writing = true;
      api
        .json<ProjectMeta>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name: (e as CustomEvent).detail }) })
        .then((m) => (knownUpdatedAt = m.updatedAt))
        .finally(() => (writing = false));
    };
    const sh = () => setDialog('shortcuts');
    window.addEventListener('editor:rename', h);
    window.addEventListener('editor:shortcuts', sh);
    return () => {
      window.removeEventListener('editor:rename', h);
      window.removeEventListener('editor:shortcuts', sh);
    };
  }, []);

  // keyboard shortcuts (all defined in actions.ts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable) {
        // still allow save/undo-free shortcuts like Ctrl+S from inputs
        if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's')) return;
      }
      if (dialog) return;
      // buttons keep focus after clicks; don't let Enter/Space re-click them
      if (t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) t.blur();
      handleKey(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);

  const saveState = saving
    ? 'Saving…'
    : saveError
      ? `Save failed: ${saveError}`
      : version === savedVersion
        ? 'All changes saved'
        : 'Unsaved changes';

  const s = useEditor.getState();
  return (
    <div className="h-full flex flex-col">
      <TopBar onSave={save} onExport={exportFile} saveState={saveState} />
      {externalChange && (
        <div className="flex items-center gap-3 px-4 py-2 bg-[#3a3320] text-[#ffe6a3] border-b border-line">
          <span className="flex-1">This file was changed outside the editor (for example by the CLI or an AI tool) while you have unsaved edits.</span>
          <button className="btn h-7" onClick={reloadFromDisk}>
            Load their version
          </button>
          <button
            className="btn h-7"
            onClick={() => {
              knownUpdatedAt = externalChange.updatedAt;
              setExternalChange(null);
              save();
            }}
          >
            Keep mine
          </button>
        </div>
      )}
      <div className="flex-1 flex min-h-0">
        <aside className="w-[240px] shrink-0 border-r border-line bg-bg1 flex flex-col">
          <Tabs
            items={[
              { id: 'layers', label: 'Layers', icon: <Layers size={12} />, title: 'Layers (Alt+T to switch)' },
              { id: 'theme', label: 'Theme', icon: <Palette size={12} />, title: 'Theme (Alt+T to switch)' },
              { id: 'assets', label: 'Assets', icon: <FileImage size={12} />, title: 'Assets (Alt+T to switch)' },
            ]}
            value={leftTab}
            onChange={(id) => s.set('leftTab', id)}
          />
          {leftTab === 'layers' ? <Hierarchy /> : leftTab === 'theme' ? <ThemePanel /> : <AssetsPanel />}
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
          <Stage />
          {codeOpen && <CodePanel />}
          {mode === 'animate' && <AnimatePanel />}
        </div>
        <aside className="w-[272px] shrink-0 border-l border-line bg-bg1 flex flex-col">
          <Inspector />
        </aside>
      </div>
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'prefs' && <PreferencesDialog onClose={() => setDialog(null)} />}
      <ContextMenuHost />
      <Toaster />
    </div>
  );
}

function captureThumbnail(): string | undefined {
  try {
    const s = useEditor.getState();
    const canvas = document.querySelector('canvas');
    const ab = s.doc?.artboards[0];
    if (!canvas || !ab) return undefined;
    const dpr = window.devicePixelRatio || 1;
    const v = s.view;
    const pos = artboardPos(ab.artboard);
    const x = (v.panX + pos.x * v.zoom) * dpr;
    const y = (v.panY + pos.y * v.zoom) * dpr;
    const w = prop(ab.artboard, 'width') * v.zoom * dpr;
    const h = prop(ab.artboard, 'height') * v.zoom * dpr;
    if (w < 4 || h < 4) return undefined;
    const out = document.createElement('canvas');
    const scale = Math.min(1, 360 / w, 240 / h);
    out.width = Math.max(1, Math.round(w * scale));
    out.height = Math.max(1, Math.round(h * scale));
    out.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
