'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, GraduationCap, X } from 'lucide-react';
import { exportRiv, importRiv, RiveDoc } from '@/lib/rive/document';
import { Example, EXAMPLES } from '@/lib/rive/examples';
import { TEMPLATES, Template } from '@/lib/rive/templates';
import { ARTBOARD_PRESETS } from '@/lib/rive/presets';
import { loadBundledFont } from '@/lib/client/fonts';
import { RivePlayer } from './RivePlayer';

type Font = { name: string; bytes: Uint8Array };

function useFont() {
  const [font, setFont] = useState<Font | null>(null);
  useEffect(() => {
    loadBundledFont()
      .then(setFont)
      .catch(() => setFont(null));
  }, []);
  return font;
}

export function buildTemplate(t: Template, font: Font | null, size?: { w: number; h: number }): RiveDoc {
  const doc = t.build(font ?? undefined);
  if (size && t.id === 'blank') {
    doc.artboards[0].artboard.props.width = size.w;
    doc.artboards[0].artboard.props.height = size.h;
  }
  return doc;
}

function TemplateCard({ t, font, onUse, disabled }: { t: Template; font: Font | null; onUse: () => void; disabled?: boolean }) {
  const bytes = useMemo(() => (t.usesText && !font ? null : exportRiv(buildTemplate(t, font))), [t, font]);
  return (
    <div className="rounded-xl bg-bg1 border border-line hover:border-line2 overflow-hidden flex flex-col">
      <div className="aspect-[4/2.6] bg-[#0e0e0e] relative">
        {t.id === 'blank' ? (
          <div className="absolute inset-0 flex items-center justify-center text-t3">Empty artboard</div>
        ) : (
          <RivePlayer bytes={bytes} className="absolute inset-0" />
        )}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="font-medium text-[13px]">{t.name}</div>
        <div className="text-t2 text-[11px] flex-1">{t.description}</div>
        <div className="flex flex-wrap gap-1">
          {t.learn.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-bg3 text-t1">
              {l}
            </span>
          ))}
        </div>
        <button className="btn btn-primary h-7 mt-1" disabled={disabled} onClick={onUse}>
          Use template
        </button>
      </div>
    </div>
  );
}

const exampleCache = new Map<string, Promise<Uint8Array>>();
export function loadExample(ex: Example): Promise<Uint8Array> {
  if (!exampleCache.has(ex.file)) {
    exampleCache.set(
      ex.file,
      fetch(ex.file).then(async (r) => {
        if (!r.ok) throw new Error(`Could not load ${ex.name}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
  }
  return exampleCache.get(ex.file)!;
}

function ExampleCard({ ex, onUse, disabled }: { ex: Example; onUse: (bytes: Uint8Array) => void; disabled?: boolean }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  useEffect(() => {
    loadExample(ex).then(setBytes, () => setBytes(null));
  }, [ex]);
  return (
    <div className="rounded-xl bg-bg1 border border-line hover:border-line2 overflow-hidden flex flex-col">
      <div className="aspect-[4/2.6] bg-[#0e0e0e] relative">
        <RivePlayer bytes={bytes} className="absolute inset-0" artboardName={ex.artboard} mixAll={ex.mixAll} />
        <span className="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-t1">Example</span>
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="font-medium text-[13px]">{ex.name}</div>
        <div className="text-t2 text-[11px] flex-1">{ex.description}</div>
        <div className="flex flex-wrap gap-1">
          {ex.learn.map((l) => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-bg3 text-t1">
              {l}
            </span>
          ))}
        </div>
        <button className="btn btn-primary h-7 mt-1" disabled={disabled || !bytes} onClick={() => bytes && onUse(bytes)}>
          Open a copy
        </button>
      </div>
    </div>
  );
}

const KEY = 'openrive:templates-collapsed';

export function TemplateGallery({ onCreate, disabled }: { onCreate: (name: string, doc: RiveDoc) => void; disabled?: boolean }) {
  const font = useFont();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    // read after mount so the prerendered HTML matches the first client render
    const t = setTimeout(() => {
      try {
        setCollapsed(localStorage.getItem(KEY) === '1');
      } catch {
        /* storage unavailable */
      }
    });
    return () => clearTimeout(t);
  }, []);
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(KEY, collapsed ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  return (
    <section className="mb-8">
      <button className="flex items-center gap-2 mb-3 text-[14px] font-semibold" onClick={toggle}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        <GraduationCap size={16} className="text-accent" /> Start from a template
        <span className="text-t2 font-normal text-[12px]">Beginner-friendly files that each teach a Rive idea</span>
      </button>
      {!collapsed && (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {TEMPLATES.filter((t) => t.id !== 'blank').map((t) => (
            <TemplateCard key={t.id} t={t} font={font} disabled={disabled} onUse={() => onCreate(t.name, buildTemplate(t, font))} />
          ))}
          {EXAMPLES.map((ex) => (
            <ExampleCard key={ex.id} ex={ex} disabled={disabled} onUse={(b) => onCreate(ex.name, importRiv(b))} />
          ))}
        </div>
      )}
    </section>
  );
}

export function NewFileDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, doc: RiveDoc) => void }) {
  const font = useFont();
  const [name, setName] = useState('Untitled');
  const [templateId, setTemplateId] = useState('blank');
  const [preset, setPreset] = useState(ARTBOARD_PRESETS[0].label);
  const [custom, setCustom] = useState({ w: 500, h: 500 });
  const template = TEMPLATES.find((t) => t.id === templateId);
  const size = preset === 'Custom' ? custom : ARTBOARD_PRESETS.find((p) => p.label === preset)!;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onMouseDown={onClose}>
      <div className="bg-bg2 rounded-xl w-[520px] border border-line2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center p-4 border-b border-line">
          <h2 className="text-[14px] font-semibold flex-1">New file</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="label">Name</span>
            <input autoFocus className="field h-8" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="flex flex-col gap-1">
            <span className="label">Start with</span>
            <div className="grid grid-cols-2 gap-2">
              {[...TEMPLATES, ...EXAMPLES].map((t) => (
                <button
                  key={t.id}
                  className={`text-left p-2.5 rounded-lg border ${templateId === t.id ? 'border-accent bg-[#57a5e01a]' : 'border-line hover:border-line2'}`}
                  onClick={() => {
                    setTemplateId(t.id);
                    if (name === 'Untitled' || [...TEMPLATES, ...EXAMPLES].some((x) => x.name === name)) setName(t.id === 'blank' ? 'Untitled' : t.name);
                  }}
                >
                  <div className="font-medium">{t.name}</div>
                  <div className="text-t2 text-[11px] line-clamp-2">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
          {templateId === 'blank' && (
            <div className="flex flex-col gap-1">
              <span className="label">Artboard size</span>
              <div className="flex gap-2">
                <select className="field h-8" value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {ARTBOARD_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label} ({p.w}×{p.h})
                    </option>
                  ))}
                  <option value="Custom">Custom…</option>
                </select>
                {preset === 'Custom' && (
                  <>
                    <input className="field h-8 w-20" type="number" value={custom.w} onChange={(e) => setCustom({ ...custom, w: Math.max(1, +e.target.value) })} />
                    <input className="field h-8 w-20" type="number" value={custom.h} onChange={(e) => setCustom({ ...custom, h: Math.max(1, +e.target.value) })} />
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t border-line">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!!template?.usesText && !font}
            onClick={async () => {
              const ex = EXAMPLES.find((e) => e.id === templateId);
              if (ex) onCreate(name.trim() || ex.name, importRiv(await loadExample(ex)));
              else onCreate(name.trim() || 'Untitled', buildTemplate(template!, font, size));
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
