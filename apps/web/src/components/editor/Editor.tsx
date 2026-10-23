'use client';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { exportRiv, RiveDoc } from '@openrive/rive/document';
import { diagnoseDocument, type FileHealthReport } from '@openrive/rive/diagnostics';
import { exportSource } from '@openrive/rive/source';
import { artboardPos, prop } from '@openrive/rive/scene';
import { downloadBytes, docStats } from '@/lib/client/projects';
import { parseDoc, stringifyDoc, toBase64 } from '@openrive/shared/serialize';
import { api, localUserHeaders } from '@/lib/client/session';
import { usePrefs } from '@/lib/client/prefs';
import { useEditor } from '@/lib/store/editor';
import type { ProjectMeta } from '@openrive/shared';
import { TopBar } from './TopBar';
import { ShortcutsDialog } from './ShortcutsDialog';
import { PreferencesDialog } from './PreferencesDialog';
import { ContextMenuHost } from './ContextMenu';
import { EditorWorkspace } from './EditorWorkspace';
import { Toaster } from '@/components/Toaster';
import { Modal } from '@openrive/ui';
import { AnimationExportDialog } from './AnimationExportDialog';
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
  const gestureStart = useEditor((s) => s.gestureStart);
  const readOnly = useEditor((s) => s.readOnly);
  const leftTab = useEditor((s) => s.leftTab);
  const codeOpen = useEditor((s) => s.codeOpen);
  const liveDoc = useEditor((s) => s.doc);
  // Image components only reference file-level assets; keep their sizes known for bounds/hit testing
  if (liveDoc) registerImageSizes(imageSizes(liveDoc));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'shortcuts' | 'prefs' | 'animation-export' | null>(null);
  const [healthReport, setHealthReport] = useState<FileHealthReport | null>(null);
  const [svgImportWarnings, setSvgImportWarnings] = useState<string[] | null>(null);
  const [quickStartStep, setQuickStartStep] = useState<number | null>(null);
  const [externalChange, setExternalChange] = useState<ProjectMeta | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => usePrefs.getState().init(), []);

  useEffect(() => {
    try {
      if (localStorage.getItem('openrive:onboarding:pending') === '1') {
        localStorage.removeItem('openrive:onboarding:pending');
        startTransition(() => setQuickStartStep(0));
      }
    } catch {
      /* onboarding remains optional when storage is unavailable */
    }
  }, []);

  useEffect(() => {
    const onSvgWarnings = (event: Event) => {
      const warnings = (event as CustomEvent<string[]>).detail;
      if (Array.isArray(warnings) && warnings.length) setSvgImportWarnings(warnings);
    };
    window.addEventListener('editor:svg-import-warnings', onSvgWarnings);
    return () => window.removeEventListener('editor:svg-import-warnings', onSvgWarnings);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const queued = saveQueue.current.then(async () => {
      const s = useEditor.getState();
      if (!s.doc || !s.projectId || s.readOnly) return;
      const v = s.version;
      writing = true;
      try {
        const riv = exportRiv(s.doc);
        const meta = await api.json<ProjectMeta>(`/api/projects/${s.projectId}`, {
          method: 'PUT',
          body: JSON.stringify({
            doc: stringifyDoc(s.doc),
            riv: toBase64(riv),
            thumbnail: captureThumbnail(),
            expectedUpdatedAt: knownUpdatedAt || undefined,
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
      }
    });
    saveQueue.current = queued;
    try {
      await queued;
    } finally {
      if (saveQueue.current === queued) {
        saveQueue.current = Promise.resolve();
        setSaving(false);
      }
    }
  }, []);

  const exportFile = useCallback(() => {
    const s = useEditor.getState();
    if (!s.doc) return;
    const filename = `${s.projectName.replace(/[^\w\- ]+/g, '').trim() || 'file'}.riv`;
    try {
      downloadBytes(exportRiv(s.doc), filename);
      toast(`Exported ${filename}`);
    } catch (error) {
      toast(`Export failed: ${(error as Error).message}`);
    }
  }, []);

  const exportEditableSource = useCallback(() => {
    const s = useEditor.getState();
    if (!s.doc) return;
    try {
      const filename = `${s.projectName.replace(/[^\w\- ]+/g, '').trim() || 'file'}.oriv`;
      downloadBytes(exportSource(s.doc), filename);
      toast(`Exported editable source ${filename}`);
    } catch (error) {
      toast(`Source export failed: ${(error as Error).message}`);
    }
  }, []);

  const checkFile = useCallback(() => {
    const doc = useEditor.getState().doc;
    if (doc) setHealthReport(diagnoseDocument(doc));
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
    const res = await fetch(`/api/projects/${s.projectId}`, { headers: localUserHeaders(), cache: 'no-store' });
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
    if (readOnly || version === savedVersion || externalChange || gestureStart) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!useEditor.getState().gestureStart) save();
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [version, savedVersion, gestureStart, readOnly, save, externalChange]);

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
        .json<ProjectMeta>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name: (e as CustomEvent).detail, expectedUpdatedAt: knownUpdatedAt || undefined }) })
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
      // Let the browser emit its paste event so SVG or PNG data from Figma,
      // Illustrator and the system clipboard can be imported before falling
      // back to OpenRive's internal object clipboard.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') return;
      if (dialog || healthReport || svgImportWarnings || quickStartStep !== null) return;
      // buttons keep focus after clicks; don't let Enter/Space re-click them
      if (t.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) t.blur();
      handleKey(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, healthReport, svgImportWarnings, quickStartStep]);

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
      <TopBar onSave={save} onExport={exportFile} onExportSource={exportEditableSource} onExportAnimation={() => setDialog('animation-export')} onDiagnose={checkFile} saveState={saveState} />
      {quickStartStep !== null && <QuickStart step={quickStartStep} onStep={setQuickStartStep} onClose={() => setQuickStartStep(null)} />}
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
      <EditorWorkspace mode={mode} leftTab={leftTab} codeOpen={codeOpen} onLeftTabChange={(tab) => s.set('leftTab', tab)} />
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'prefs' && <PreferencesDialog onClose={() => setDialog(null)} />}
      {dialog === 'animation-export' && liveDoc && <AnimationExportDialog doc={liveDoc} projectName={s.projectName} onClose={() => setDialog(null)} />}
      {healthReport && <FileHealthDialog report={healthReport} onClose={() => setHealthReport(null)} />}
      {svgImportWarnings && <SvgImportWarningsDialog warnings={svgImportWarnings} onClose={() => setSvgImportWarnings(null)} />}
      <ContextMenuHost />
      <Toaster />
    </div>
  );
}

function QuickStart({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const copy = [
    { title: 'Start with the canvas', body: 'Select a shape in Layers or on the canvas. Change its size or color in Inspector; every edit is undoable.', action: 'Show me Animate mode' },
    { title: 'Make it move', body: 'Animate mode gives you timelines and keyframes. Press Tab to switch back to Design mode whenever you need.', action: 'Open Preview' },
    { title: 'Try the finished interaction', body: 'Preview runs the saved Rive file with its state machine and data properties. Hover or click the artboard to test it.', action: 'Done' },
  ][step]!;
  const next = () => {
    if (step === 0) {
      useEditor.getState().set('mode', 'animate');
      onStep(1);
    } else if (step === 1) {
      editorHandlers.preview?.();
      onStep(2);
    } else {
      onClose();
    }
  };
  return (
    <div className="quick-start flex items-center gap-4 px-4 py-2.5 bg-bg2 border-b border-line" role="region" aria-label={`Quick start, step ${step + 1} of 3`}>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold">{copy.title}<span className="text-t3 font-normal ml-2">{step + 1} of 3</span></div>
        <p className="text-[11px] text-t1 mt-0.5">{copy.body}</p>
      </div>
      <button className="btn btn-primary h-7 whitespace-nowrap" onClick={next}>{copy.action}</button>
      <button className="btn h-7" onClick={onClose} aria-label="Skip quick start">Skip</button>
    </div>
  );
}

function FileHealthDialog({ report, onClose }: { report: FileHealthReport; onClose: () => void }) {
  const errors = report.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = report.diagnostics.filter((d) => d.severity === 'warning').length;
  const infos = report.diagnostics.filter((d) => d.severity === 'info').length;
  return (
    <Modal title="File health" width={580} className="max-h-[85vh] flex flex-col" onClose={onClose}>
      <div className="p-4 flex flex-col gap-4 min-h-0">
        <div>
          <p className="text-[13px] font-medium">{report.valid ? 'This file is ready to export.' : 'Fix the errors below before relying on this file.'}</p>
          <p className="text-[11px] text-t2 mt-1">Rive format {report.fileVersion ?? 'unknown'} · {report.counts.artboards} artboards · {report.counts.objects} objects · {report.counts.assets} assets</p>
        </div>
        <div className="flex gap-4 text-[11px] text-t1" aria-label="Diagnostic totals">
          <span className={errors ? 'text-red-300' : ''}>{errors} errors</span><span>{warnings} warnings</span><span>{infos} notes</span>
        </div>
        <div className="overflow-y-auto min-h-0 flex flex-col divide-y divide-line">
          {report.diagnostics.length ? report.diagnostics.map((item, i) => (
            <div key={`${item.code}-${i}`} className="py-3 first:pt-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-semibold ${item.severity === 'error' ? 'text-red-300' : item.severity === 'warning' ? 'text-amber-300' : 'text-t2'}`}>{item.severity}</span>
                <span className="text-[12px] font-medium">{item.title}</span>
              </div>
              <p className="text-[11px] text-t1 mt-1">{item.message}</p>
              {item.fix && <p className="text-[11px] text-t2 mt-1">Suggested fix: {item.fix}</p>}
            </div>
          )) : <p className="text-[12px] text-t2 py-2">No file health issues found.</p>}
        </div>
        <p className="text-[10px] text-t3">This check covers file structure and features OpenRive can identify. Always preview the exported file in your target runtime.</p>
      </div>
    </Modal>
  );
}

function SvgImportWarningsDialog({ warnings, onClose }: { warnings: string[]; onClose: () => void }) {
  return (
    <Modal title="SVG import notes" width={520} onClose={onClose}>
      <div className="p-4 flex flex-col gap-3">
        <p className="text-[12px] text-t1">The supported vector artwork was imported as editable shapes. These SVG features could not be preserved:</p>
        <ul className="list-disc pl-5 flex flex-col gap-2 text-[11px] text-t2" aria-label="Unsupported SVG features">
          {warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
        </ul>
        <div className="flex justify-end pt-1">
          <button className="btn btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </Modal>
  );
}

function captureThumbnail(): string | undefined {
  try {
    const s = useEditor.getState();
    const canvas = document.querySelector('canvas');
    const ab = s.doc?.artboards.find((artboard) => artboard.id === s.activeArtboardId) ?? s.doc?.artboards[0];
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
    const sourceX = Math.max(0, x);
    const sourceY = Math.max(0, y);
    const sourceRight = Math.min(canvas.width, x + w);
    const sourceBottom = Math.min(canvas.height, y + h);
    if (sourceRight <= sourceX || sourceBottom <= sourceY) return undefined;
    const scaleX = out.width / w;
    const scaleY = out.height / h;
    out.getContext('2d')!.drawImage(canvas, sourceX, sourceY, sourceRight - sourceX, sourceBottom - sourceY, (sourceX - x) * scaleX, (sourceY - y) * scaleY, (sourceRight - sourceX) * scaleX, (sourceBottom - sourceY) * scaleY);
    return out.toDataURL('image/png');
  } catch {
    return undefined;
  }
}
