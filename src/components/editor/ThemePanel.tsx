'use client';
import { useState } from 'react';
import { Copy, Palette, Plus, Trash2 } from 'lucide-react';
import { colorCss } from '@/lib/rive/ops';
import { activeTheme, addSwatch, addTheme, applyTheme, countBindings, removeSwatch, removeTheme, renameSwatch, setSwatchColor } from '@/lib/rive/theme';
import { useEditor } from '@/lib/store/editor';
import { ColorPicker } from './controls';
import { openContextMenu, sep } from './ContextMenu';

export function ThemePanel() {
  const doc = useEditor((s) => s.doc);
  const readOnly = useEditor((s) => s.readOnly);
  const [editing, setEditing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const s = useEditor.getState();
  if (!doc) return null;
  const meta = doc.editor;
  const theme = activeTheme(doc);
  const swatches = meta?.swatches ?? [];

  const add = () =>
    s.commit((d) => {
      addSwatch(d, `Color ${swatches.length + 1}`, 0xff57a5e0);
    });

  return (
    <div className="flex-1 overflow-auto flex flex-col">
      <div className="section flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Palette size={13} className="text-t2" />
          <span className="panel-title flex-1">Theme</span>
          <button
            className="icon-btn"
            disabled={readOnly}
            title="New theme (copies the current one)"
            onClick={() =>
              s.commit((d) => {
                const t = addTheme(d, `Theme ${(d.editor?.themes.length ?? 0) + 1}`);
                applyTheme(d, t.id);
              })
            }
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(meta?.themes ?? []).map((t) => (
            <button
              key={t.id}
              className={`px-2.5 h-6 rounded text-[11px] ${t.id === theme?.id ? 'bg-accent text-white' : 'bg-bg3 text-t1 hover:text-t0'}`}
              onClick={() => s.commit((d) => applyTheme(d, t.id))}
              onDoubleClick={() => {
                if (readOnly) return;
                const name = prompt('Theme name', t.name);
                if (name) s.commit((d) => void (d.editor!.themes.find((x) => x.id === t.id)!.name = name));
              }}
              onContextMenu={(e) =>
                openContextMenu(e, [
                  { label: 'Apply', run: () => s.commit((d) => applyTheme(d, t.id)) },
                  {
                    label: 'Rename…',
                    disabled: readOnly,
                    run: () => {
                      const name = prompt('Theme name', t.name);
                      if (name) s.commit((d) => void (d.editor!.themes.find((x) => x.id === t.id)!.name = name));
                    },
                  },
                  {
                    label: 'Duplicate',
                    icon: <Copy size={12} />,
                    disabled: readOnly,
                    run: () => s.commit((d) => void addTheme(d, `${t.name} Copy`, t.id)),
                  },
                  sep,
                  {
                    label: 'Delete theme',
                    danger: true,
                    disabled: readOnly || (meta?.themes.length ?? 0) <= 1,
                    run: () => s.commit((d) => removeTheme(d, t.id)),
                  },
                ])
              }
            >
              {t.name}
            </button>
          ))}
        </div>
        <p className="text-t3 text-[11px]">
          Define colors once, then use them on fills, strokes, gradient stops and color keys. Switching the theme or editing a color
          updates everything that uses it.
        </p>
      </div>

      <div className="section flex flex-col gap-1">
        <div className="flex items-center mb-1">
          <span className="panel-title flex-1">Colors{theme ? ` · ${theme.name}` : ''}</span>
          <button className="icon-btn" disabled={readOnly} onClick={add} title="Add color">
            <Plus size={14} />
          </button>
        </div>
        {!swatches.length && <div className="text-t3 text-[11px]">No theme colors yet.</div>}
        {swatches.map((sw) => {
          const c = theme?.colors[sw.id] ?? 0xff000000;
          const uses = countBindings(doc, sw.id);
          return (
            <div key={sw.id} className="relative">
              <div
                className="flex items-center gap-2 h-8 px-1.5 rounded hover:bg-bg2"
                onContextMenu={(e) =>
                  openContextMenu(e, [
                    { label: 'Edit color', run: () => setEditing(sw.id) },
                    { label: 'Rename', disabled: readOnly, run: () => setRenaming(sw.id) },
                    sep,
                    { label: 'Delete color', danger: true, disabled: readOnly, run: () => s.commit((d) => removeSwatch(d, sw.id)) },
                  ])
                }
              >
                <button
                  className="w-6 h-6 rounded checker overflow-hidden border border-line2 shrink-0"
                  onClick={() => setEditing(editing === sw.id ? null : sw.id)}
                  title="Edit color"
                >
                  <span className="block w-full h-full" style={{ background: colorCss(c) }} />
                </button>
                {renaming === sw.id ? (
                  <input
                    autoFocus
                    className="field h-6"
                    defaultValue={sw.name}
                    onBlur={(e) => {
                      setRenaming(null);
                      if (e.target.value.trim()) s.commit((d) => renameSwatch(d, sw.id, e.target.value.trim()));
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <span className="flex-1 truncate" onDoubleClick={() => !readOnly && setRenaming(sw.id)}>
                    {sw.name}
                  </span>
                )}
                <span className="text-t3 text-[11px] shrink-0">{uses ? `${uses} use${uses > 1 ? 's' : ''}` : 'unused'}</span>
                <button className="icon-btn w-6 h-6 shrink-0" disabled={readOnly} onClick={() => s.commit((d) => removeSwatch(d, sw.id))} title="Delete">
                  <Trash2 size={12} />
                </button>
              </div>
              {editing === sw.id && !readOnly && (
                <div className="menu my-1">
                  <ColorPicker value={c} onChange={(v, t) => s.commit((d) => setSwatchColor(d, sw.id, v), t)} hideSwatches />
                  <div className="flex justify-end px-2 pb-1">
                    <button className="btn h-6 px-2" onClick={() => setEditing(null)}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
