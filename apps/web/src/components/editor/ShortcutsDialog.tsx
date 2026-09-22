'use client';
import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { usePrefs } from '@/lib/client/prefs';
import { ACTIONS, ActionCategory, comboFromEvent, formatCombo } from './actions';
import { Modal } from '@openrive/ui';

const CATEGORIES: ActionCategory[] = ['File', 'Edit', 'Object', 'Arrange', 'Tools', 'View', 'Animate'];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const prefs = usePrefs((s) => s.prefs);
  const update = usePrefs((s) => s.update);
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const bindings = (id: string, defaults: string[]) => prefs.shortcuts[id] ?? defaults;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // the recording field stops propagation, so Escape there only cancels recording
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const conflicts = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of ACTIONS) {
      for (const k of prefs.shortcuts[a.id] ?? a.keys) {
        const key = `${a.when ?? '*'}|${k}`;
        map.set(key, [...(map.get(key) ?? []), a.id]);
      }
    }
    return map;
  }, [prefs.shortcuts]);

  const record = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setRecording(null);
      return;
    }
    const combo = comboFromEvent(e);
    if (!combo) return;
    const action = ACTIONS.find((a) => a.id === id)!;
    const clash = ACTIONS.find(
      (a) => a.id !== id && (prefs.shortcuts[a.id] ?? a.keys).includes(combo) && (!a.when || !action.when || a.when === action.when),
    );
    setWarning(clash ? `${formatCombo(combo)} was also used by “${clash.label}”. It now runs “${action.label}” first.` : null);
    update({ shortcuts: { ...prefs.shortcuts, [id]: [combo] } });
    setRecording(null);
  };

  const q = query.toLowerCase();
  return (
    <Modal
      title="Keyboard shortcuts"
      width={760}
      className="max-h-[85vh] flex flex-col"
      onClose={onClose}
      headerRight={
        <>
          <div className="relative">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-t2" />
            <input autoFocus className="field pl-7 w-56 h-7" placeholder="Search commands" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn h-7" onClick={() => update({ shortcuts: {} })} title="Restore all default shortcuts">
            <RotateCcw size={13} /> Reset all
          </button>
        </>
      }
    >
        <div className="px-4 py-2 text-t2 text-[11px] border-b border-line">
          Click a shortcut, then press the new key combination (Esc cancels). Ctrl also means ⌘ on macOS.
          {warning && <div className="text-[#ffcf33] mt-1">{warning}</div>}
        </div>
        <div className="overflow-auto p-4 grid grid-cols-2 gap-x-6 gap-y-4">
          {CATEGORIES.map((cat) => {
            const list = ACTIONS.filter((a) => a.category === cat && (!q || a.label.toLowerCase().includes(q)));
            if (!list.length) return null;
            return (
              <div key={cat}>
                <div className="panel-title mb-1.5">{cat}</div>
                {list.map((a) => {
                  const keys = bindings(a.id, a.keys);
                  const custom = !!prefs.shortcuts[a.id];
                  const clash = keys.some((k) => (conflicts.get(`${a.when ?? '*'}|${k}`)?.length ?? 0) > 1);
                  return (
                    <div key={a.id} className="flex items-center gap-2 py-0.5 group">
                      <span className="flex-1 truncate text-t1">
                        {a.label}
                        {a.when && <span className="text-t3 text-[10px] ml-1">({a.when})</span>}
                      </span>
                      {recording === a.id ? (
                        <input
                          autoFocus
                          readOnly
                          className="field h-6 w-36 text-center text-accent"
                          value="Press keys…"
                          onKeyDown={(e) => record(e, a.id)}
                          onBlur={() => setRecording(null)}
                        />
                      ) : (
                        <button
                          className={`flex gap-1 justify-end min-w-[90px] rounded px-1 hover:bg-bg3 ${clash ? 'outline outline-1 outline-[#ffcf33]' : ''}`}
                          onClick={() => setRecording(a.id)}
                          title={clash ? 'Shares a shortcut with another command' : 'Click to change'}
                        >
                          {keys.length ? (
                            keys.map((k) => (
                              <span key={k} className={`kbd ${custom ? 'text-accent' : ''}`}>
                                {formatCombo(k)}
                              </span>
                            ))
                          ) : (
                            <span className="text-t3 text-[11px]">none</span>
                          )}
                        </button>
                      )}
                      <button
                        className={`icon-btn w-5 h-5 ${custom ? '' : 'invisible'}`}
                        title="Reset to default"
                        onClick={() => {
                          const next = { ...prefs.shortcuts };
                          delete next[a.id];
                          update({ shortcuts: next });
                        }}
                      >
                        <RotateCcw size={11} />
                      </button>
                      <button
                        className="icon-btn w-5 h-5 invisible group-hover:visible"
                        title="Remove shortcut"
                        onClick={() => update({ shortcuts: { ...prefs.shortcuts, [a.id]: [] } })}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div>
            <div className="panel-title mb-1.5">Mouse</div>
            {[
              ['Pan', 'Space + drag, middle drag, or wheel'],
              ['Zoom', 'Ctrl / ⌘ + wheel'],
              ['Constrain', 'Shift while dragging or resizing'],
              ['Enter group / edit path or text', 'Double click'],
              ['More options', 'Right click'],
            ].map(([k, d]) => (
              <div key={k} className="flex items-center justify-between py-0.5 gap-3">
                <span className="text-t1">{k}</span>
                <span className="text-t2 text-[11px]">{d}</span>
              </div>
            ))}
          </div>
        </div>
    </Modal>
  );
}
