'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Hash, MousePointerClick, Play, Plus, Square, ToggleLeft, Trash2, Zap } from 'lucide-react';
import { ArtboardDoc, CoreObj } from '@/lib/rive/document';
import { newLayer, obj } from '@/lib/rive/factory';
import { findArtboard, findObj } from '@/lib/rive/ops';
import { prop } from '@/lib/rive/scene';
import { isA } from '@/lib/rive/schema';
import { useActiveArtboard, useEditor } from '@/lib/store/editor';
import { NumberField, Row, Select, TextField } from './controls';
import { displayName } from './Hierarchy';
import { engineRef } from './engineRef';
import { MenuItem, openContextMenu, sep } from './ContextMenu';

const NODE_W = 132;
const NODE_H = 34;

function useSM() {
  const ab = useActiveArtboard();
  const smId = useEditor((s) => s.stateMachineId);
  const layerId = useEditor((s) => s.layerId);
  const sm = ab?.stateMachines.find((m) => m.id === smId);
  const layers = (sm?.children ?? []).filter((c) => isA(c.type, 'StateMachineLayer'));
  const layer = layers.find((l) => l.id === layerId) ?? layers[0];
  return { ab, sm, layers, layer };
}

/** Mutates the current state machine inside a commit. */
function editSM(abId: string, smId: string, fn: (sm: CoreObj, ab: ArtboardDoc) => void) {
  useEditor.getState().commit((d) => {
    const ab = findArtboard(d, abId);
    const sm = ab?.stateMachines.find((m) => m.id === smId);
    if (ab && sm) fn(sm, ab);
  });
}

function stateLabel(ab: ArtboardDoc, st: CoreObj) {
  if (st.type === 'EntryState') return 'Entry';
  if (st.type === 'AnyState') return 'Any State';
  if (st.type === 'ExitState') return 'Exit';
  if (st.type === 'AnimationState') {
    const a = ab.animations.find((x) => x.id === st.props.animationId);
    return a ? String(a.props.name ?? 'Timeline') : 'No timeline';
  }
  return st.type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function defaultPos(st: CoreObj, i: number, states: CoreObj[]): { x: number; y: number } {
  if (st.type === 'AnyState') return { x: 20, y: 20 };
  if (st.type === 'EntryState') return { x: 20, y: 80 };
  if (st.type === 'ExitState') return { x: 20, y: 140 };
  // other states in a grid to the right, in layer order
  const k = states.filter((s, j) => j < i && !['AnyState', 'EntryState', 'ExitState'].includes(s.type)).length;
  return { x: 200 + (k % 3) * 160, y: 20 + Math.floor(k / 3) * 60 };
}

function usePreviewInputs() {
  return useSyncExternalStore(
    (cb) => {
      const e = engineRef.current;
      if (!e) return () => {};
      const off = e.subscribe(cb);
      return () => {
        off();
      };
    },
    () => engineRef.current?.inputs ?? EMPTY,
    () => EMPTY,
  );
}
const EMPTY: never[] = [];

export function StateMachineGraph() {
  const { ab, sm, layers, layer } = useSM();
  const previewing = useEditor((s) => s.previewing);
  const readOnly = useEditor((s) => s.readOnly);
  const smSelection = useEditor((s) => s.smSelection);
  const [tab, setTab] = useState<'inputs' | 'listeners'>('inputs');
  const [addMenu, setAddMenu] = useState<string | null>(null);
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const graphRef = useRef<HTMLDivElement>(null);
  const liveInputs = usePreviewInputs();
  const s = useEditor.getState();

  useEffect(() => {
    const close = () => setAddMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const states = useMemo(() => (layer?.children ?? []).filter((c) => isA(c.type, 'LayerState')), [layer]);
  const posOf = (st: CoreObj, i: number) => ({ ...defaultPos(st, i, states), ...(st.ui as { x?: number; y?: number }) }) as { x: number; y: number };

  if (!ab || !sm) return null;
  const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput'));
  const listeners = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineListener'));

  const addInput = (type: 'StateMachineNumber' | 'StateMachineBool' | 'StateMachineTrigger') => {
    const base = type === 'StateMachineNumber' ? 'Number' : type === 'StateMachineBool' ? 'Boolean' : 'Trigger';
    let n = 1;
    while (inputs.some((i) => i.props.name === `${base} ${n}`)) n++;
    const input = obj(type, { name: `${base} ${n}` });
    editSM(ab.id, sm.id, (m) => {
      m.children ??= [];
      // inputs are listed before layers
      const firstLayer = m.children.findIndex((c) => !isA(c.type, 'StateMachineInput'));
      if (firstLayer < 0) m.children.push(input);
      else m.children.splice(firstLayer, 0, input);
    });
    s.set('smSelection', { kind: 'input', id: input.id });
  };

  const addListener = () => {
    const target = s.selection.find((id) => findObj(ab, id)?.type === 'Shape') ?? ab.objects.find((o) => o.type === 'Shape')?.id;
    const l = obj('StateMachineListenerSingle', { name: 'Listener', listenerTypeValue: 2, ...(target ? { targetId: target } : {}) }, []);
    editSM(ab.id, sm.id, (m) => {
      m.children ??= [];
      m.children.push(l);
    });
    s.set('smSelection', { kind: 'listener', id: l.id });
  };

  const addState = (animationId: string | null, at?: { x: number; y: number }) => {
    if (!layer) return;
    const st = obj('AnimationState', { animationId: animationId ?? '' }, []);
    st.ui = at ?? { x: 240 + (states.length % 3) * 170, y: 40 + Math.floor(states.length / 3) * 70 };
    editSM(ab.id, sm.id, (m) => {
      const l = m.children?.find((c) => c.id === layer.id);
      l?.children?.push(st);
    });
    s.set('smSelection', { kind: 'state', id: st.id });
  };

  const addLayer = () => {
    const l = newLayer(`Layer ${layers.length + 1}`);
    editSM(ab.id, sm.id, (m) => {
      m.children ??= [];
      // layers go after inputs
      const lastLayer = m.children.map((c) => isA(c.type, 'StateMachineLayer') || isA(c.type, 'StateMachineInput')).lastIndexOf(true);
      m.children.splice(lastLayer + 1, 0, l);
    });
    s.set('layerId', l.id);
  };

  const graphPoint = (e: { clientX: number; clientY: number }) => {
    const r = graphRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - pan.x, y: e.clientY - r.top - pan.y };
  };

  const dragNode = (e: React.PointerEvent, st: CoreObj, i: number) => {
    e.stopPropagation();
    s.set('smSelection', { kind: 'state', id: st.id });
    if (readOnly || previewing) return;
    const start = graphPoint(e);
    const p0 = posOf(st, i);
    s.beginGesture();
    const move = (ev: PointerEvent) => {
      const p = graphPoint(ev);
      editSM(ab.id, sm.id, (m) => {
        const l = m.children?.find((c) => c.id === layer!.id);
        const t = l?.children?.find((c) => c.id === st.id);
        if (t) t.ui = { ...t.ui, x: Math.round(p0.x + p.x - start.x), y: Math.round(p0.y + p.y - start.y) };
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      s.endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startLink = (e: React.PointerEvent, st: CoreObj) => {
    e.stopPropagation();
    if (readOnly || previewing || st.type === 'ExitState') return;
    const p = graphPoint(e);
    setLinking({ from: st.id, x: p.x, y: p.y });
    const move = (ev: PointerEvent) => {
      const q = graphPoint(ev);
      setLinking((l) => (l ? { ...l, x: q.x, y: q.y } : l));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLinking(null);
      const q = graphPoint(ev);
      const target = states.find((t, i) => {
        const tp = posOf(t, i);
        return q.x >= tp.x && q.x <= tp.x + NODE_W && q.y >= tp.y && q.y <= tp.y + NODE_H;
      });
      if (!target || target.id === st.id || target.type === 'EntryState' || target.type === 'AnyState') return;
      const tr = obj('StateTransition', { stateToId: target.id }, []);
      editSM(ab.id, sm.id, (m) => {
        const l = m.children?.find((c) => c.id === layer!.id);
        const from = l?.children?.find((c) => c.id === st.id);
        if (from) (from.children ??= []).push(tr);
      });
      s.set('smSelection', { kind: 'transition', id: tr.id });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const panGraph = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as Element).closest('svg[data-bg]')) return;
    s.set('smSelection', null);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const p0 = pan;
    const move = (ev: PointerEvent) => setPan({ x: p0.x + ev.clientX - x0, y: p0.y + ev.clientY - y0 });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // transitions
  const edges: { tr: CoreObj; from: CoreObj; to: CoreObj; fi: number; ti: number }[] = [];
  states.forEach((st, fi) => {
    for (const tr of (st.children ?? []).filter((c) => isA(c.type, 'StateTransition'))) {
      const ti = states.findIndex((t) => t.id === tr.props.stateToId);
      if (ti >= 0) edges.push({ tr, from: st, to: states[ti], fi, ti });
    }
  });
  const center = (st: CoreObj, i: number) => {
    const p = posOf(st, i);
    return { x: p.x + NODE_W / 2, y: p.y + NODE_H / 2 };
  };
  const togglePreview = () => {
    s.set('previewing', !previewing);
    s.set('playing', false);
  };

  return (
    <div className="flex-1 flex min-w-0">
      {/* inputs & listeners */}
      <div className="w-[230px] shrink-0 border-r border-line flex flex-col">
        <div className="flex h-8 border-b border-line">
          {(['inputs', 'listeners'] as const).map((t) => (
            <button key={t} className={`flex-1 capitalize ${tab === t ? 'text-t0 border-b-2 border-accent' : 'text-t2'}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-auto p-1.5">
          {tab === 'inputs' && (
            <>
              {inputs.map((inp) => {
                const live = liveInputs.find((l) => l.name === inp.props.name);
                const sel = smSelection?.kind === 'input' && smSelection.id === inp.id;
                return (
                  <div
                    key={inp.id}
                    className={`flex items-center gap-2 h-8 px-2 rounded ${sel ? 'bg-[#2a4a66]' : 'hover:bg-bg2'}`}
                    onClick={() => s.set('smSelection', { kind: 'input', id: inp.id })}
                  >
                    <span className="text-t2">
                      {inp.type === 'StateMachineNumber' ? <Hash size={13} /> : inp.type === 'StateMachineBool' ? <ToggleLeft size={13} /> : <Zap size={13} />}
                    </span>
                    <span className="flex-1 truncate">{String(inp.props.name ?? '')}</span>
                    {previewing && live && live.type === 'number' && (
                      <div className="w-16" onClick={(e) => e.stopPropagation()}>
                        <NumberField value={Number(live.value)} onChange={(v) => engineRef.current?.setInput(live.name, v)} />
                      </div>
                    )}
                    {previewing && live && live.type === 'bool' && (
                      <input
                        type="checkbox"
                        checked={!!live.value}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => engineRef.current?.setInput(live.name, e.target.checked)}
                      />
                    )}
                    {previewing && live && live.type === 'trigger' && (
                      <button
                        className="btn h-6 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          engineRef.current?.setInput(live.name, true);
                        }}
                      >
                        Fire
                      </button>
                    )}
                    {!previewing && inp.type !== 'StateMachineTrigger' && (
                      <span className="text-t2 text-[11px]">
                        {inp.type === 'StateMachineBool' ? (prop<boolean>(inp, 'value') ? 'true' : 'false') : prop(inp, 'value')}
                      </span>
                    )}
                  </div>
                );
              })}
              {!readOnly && (
                <div className="relative mt-1">
                  <button
                    className="btn h-7 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddMenu(addMenu === 'input' ? null : 'input');
                    }}
                  >
                    <Plus size={13} /> Add input
                  </button>
                  {addMenu === 'input' && (
                    <div className="menu absolute left-0 right-0 top-8">
                      <button className="menu-item" onClick={() => addInput('StateMachineNumber')}>
                        <Hash size={13} /> Number
                      </button>
                      <button className="menu-item" onClick={() => addInput('StateMachineBool')}>
                        <ToggleLeft size={13} /> Boolean
                      </button>
                      <button className="menu-item" onClick={() => addInput('StateMachineTrigger')}>
                        <Zap size={13} /> Trigger
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {tab === 'listeners' && (
            <>
              {listeners.map((l) => {
                const sel = smSelection?.kind === 'listener' && smSelection.id === l.id;
                const target = typeof l.props.targetId === 'string' ? findObj(ab, l.props.targetId) : undefined;
                return (
                  <div
                    key={l.id}
                    className={`flex items-center gap-2 h-8 px-2 rounded ${sel ? 'bg-[#2a4a66]' : 'hover:bg-bg2'}`}
                    onClick={() => s.set('smSelection', { kind: 'listener', id: l.id })}
                  >
                    <MousePointerClick size={13} className="text-t2" />
                    <span className="flex-1 truncate">{String(l.props.name || 'Listener')}</span>
                    <span className="text-t2 text-[11px] truncate max-w-[80px]">{target ? displayName(target) : 'no target'}</span>
                  </div>
                );
              })}
              {!readOnly && (
                <button className="btn h-7 w-full mt-1" onClick={addListener}>
                  <Plus size={13} /> Add listener
                </button>
              )}
              <p className="text-t3 text-[11px] mt-2 px-1">Listeners react to pointer events on a target shape and change inputs. Try them in Preview.</p>
            </>
          )}
        </div>
      </div>

      {/* graph */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-8 flex items-center gap-1 px-2 border-b border-line shrink-0">
          {layers.map((l) => (
            <button
              key={l.id}
              className={`px-2.5 h-6 rounded ${l.id === layer?.id ? 'bg-bg3 text-t0' : 'text-t2 hover:text-t0'}`}
              onClick={() => s.set('layerId', l.id)}
              onDoubleClick={() => {
                if (readOnly) return;
                const name = prompt('Layer name', String(l.props.name ?? ''));
                if (name) editSM(ab.id, sm.id, (m) => void (m.children!.find((c) => c.id === l.id)!.props.name = name));
              }}
            >
              {String(l.props.name || 'Layer')}
            </button>
          ))}
          {!readOnly && (
            <button className="icon-btn" onClick={addLayer} title="Add layer">
              <Plus size={13} />
            </button>
          )}
          {layers.length > 1 && layer && !readOnly && (
            <button
              className="icon-btn"
              title="Delete layer"
              onClick={() => {
                editSM(ab.id, sm.id, (m) => void (m.children = m.children!.filter((c) => c.id !== layer.id)));
                s.set('layerId', null);
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
          <div className="flex-1" />
          {!readOnly && (
            <div className="relative">
              <button
                className="btn h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddMenu(addMenu === 'state' ? null : 'state');
                }}
              >
                <Plus size={13} /> Add state
              </button>
              {addMenu === 'state' && (
                <div className="menu absolute right-0 top-7 max-h-64 overflow-auto">
                  {ab.animations.map((a) => (
                    <button key={a.id} className="menu-item" onClick={() => addState(a.id)}>
                      {String(a.props.name ?? 'Timeline')}
                    </button>
                  ))}
                  <div className="menu-sep" />
                  <button className="menu-item" onClick={() => addState(null)}>
                    Empty state
                  </button>
                </div>
              )}
            </div>
          )}
          <button className={`btn h-6 px-2 ${previewing ? 'btn-primary' : ''}`} onClick={togglePreview} title="Run the state machine on the stage">
            {previewing ? <Square size={12} /> : <Play size={12} />} {previewing ? 'Stop' : 'Preview'}
          </button>
        </div>
        <div
          ref={graphRef}
          className="flex-1 relative overflow-hidden"
          style={{
            backgroundColor: '#161616',
            backgroundImage: 'radial-gradient(#2a2a2a 1px, transparent 1px)',
            backgroundSize: '16px 16px',
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
          onPointerDown={panGraph}
          onDragOver={(e) => e.preventDefault()}
          onContextMenu={(e) => {
            if ((e.target as Element).closest('[data-state-node]')) return;
            const at = graphPoint(e);
            openContextMenu(e, [
              {
                label: 'Add state',
                disabled: readOnly,
                submenu: [
                  ...ab.animations.map((a): MenuItem => ({ label: String(a.props.name ?? 'Timeline'), run: () => addState(a.id, { x: at.x - NODE_W / 2, y: at.y - NODE_H / 2 }) })),
                  sep,
                  { label: 'Empty state', run: () => addState(null, { x: at.x - NODE_W / 2, y: at.y - NODE_H / 2 }) },
                ],
              },
              { label: 'Add layer', disabled: readOnly, run: addLayer },
              sep,
              { label: previewing ? 'Stop preview' : 'Preview', run: togglePreview },
              { label: 'Reset view', run: () => setPan({ x: 0, y: 0 }) },
            ]);
          }}
        >
          <svg data-bg className="absolute inset-0 w-full h-full" onPointerDown={panGraph}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" fill="#8a8a8a" />
              </marker>
              <marker id="arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" fill="#57a5e0" />
              </marker>
            </defs>
            <g transform={`translate(${pan.x} ${pan.y})`}>
              {edges.map(({ tr, from, to, fi, ti }) => {
                const a = center(from, fi);
                const b = center(to, ti);
                const sel0 = smSelection?.kind === 'transition' && smSelection.id === tr.id;
                if (Math.hypot(b.x - a.x, b.y - a.y) < 1) {
                  // self transition (or overlapping states): draw a loop above the node
                  const top = a.y - NODE_H / 2;
                  return (
                    <path
                      key={tr.id}
                      d={`M${a.x - 12} ${top} C${a.x - 24} ${top - 28} ${a.x + 24} ${top - 28} ${a.x + 12} ${top}`}
                      fill="none"
                      stroke={sel0 ? '#57a5e0' : '#8a8a8a'}
                      strokeWidth={sel0 ? 2 : 1.5}
                      markerEnd={`url(#${sel0 ? 'arrow-sel' : 'arrow'})`}
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        s.set('smSelection', { kind: 'transition', id: tr.id });
                      }}
                    />
                  );
                }
                const twoWay = edges.some((e) => e.from.id === to.id && e.to.id === from.id);
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const len = Math.hypot(dx, dy) || 1;
                const nx = -dy / len;
                const ny = dx / len;
                const off = twoWay ? 6 : 0;
                // clip line at node rectangles
                const clip = (p: { x: number; y: number }, dir: number) => {
                  const tx = Math.abs(dx) > 1e-6 ? NODE_W / 2 / Math.abs(dx) : Infinity;
                  const ty = Math.abs(dy) > 1e-6 ? NODE_H / 2 / Math.abs(dy) : Infinity;
                  const t = Math.min(tx, ty);
                  return { x: p.x + dx * t * dir, y: p.y + dy * t * dir };
                };
                const p1 = clip(a, 1);
                const p2 = clip(b, -1);
                const sel = smSelection?.kind === 'transition' && smSelection.id === tr.id;
                const hasConditions = (tr.children ?? []).length > 0;
                return (
                  <g
                    key={tr.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      s.set('smSelection', { kind: 'transition', id: tr.id });
                    }}
                    onContextMenu={(e) => {
                      s.set('smSelection', { kind: 'transition', id: tr.id });
                      const disabled = (prop(tr, 'flags') & 1) === 1;
                      openContextMenu(e, [
                        {
                          label: disabled ? 'Enable transition' : 'Disable transition',
                          disabled: readOnly,
                          run: () =>
                            editSM(ab.id, sm.id, (m) => {
                              const w = (o: CoreObj) => {
                                if (o.id === tr.id) o.props.flags = prop(o, 'flags') ^ 1;
                                o.children?.forEach(w);
                              };
                              w(m);
                            }),
                        },
                        sep,
                        { label: 'Delete transition', danger: true, disabled: readOnly, run: () => deleteSmSelection() },
                      ]);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <line x1={p1.x + nx * off} y1={p1.y + ny * off} x2={p2.x + nx * off} y2={p2.y + ny * off} stroke="transparent" strokeWidth={10} />
                    <line
                      x1={p1.x + nx * off}
                      y1={p1.y + ny * off}
                      x2={p2.x + nx * off}
                      y2={p2.y + ny * off}
                      stroke={sel ? '#57a5e0' : '#8a8a8a'}
                      strokeWidth={sel ? 2 : 1.5}
                      strokeDasharray={prop(tr, 'flags') & 1 ? '4 3' : undefined}
                      markerEnd={`url(#${sel ? 'arrow-sel' : 'arrow'})`}
                    />
                    {hasConditions && (
                      <circle cx={(p1.x + p2.x) / 2 + nx * off} cy={(p1.y + p2.y) / 2 + ny * off} r={3} fill={sel ? '#57a5e0' : '#ffcf33'} />
                    )}
                  </g>
                );
              })}
              {linking &&
                (() => {
                  const fi = states.findIndex((t) => t.id === linking.from);
                  const a = center(states[fi], fi);
                  return <line x1={a.x} y1={a.y} x2={linking.x} y2={linking.y} stroke="#57a5e0" strokeWidth={1.5} markerEnd="url(#arrow-sel)" />;
                })()}
            </g>
          </svg>
          {states.map((st, i) => {
            const p = posOf(st, i);
            const sel = smSelection?.kind === 'state' && smSelection.id === st.id;
            const special = st.type !== 'AnimationState';
            const color =
              st.type === 'EntryState' ? '#27c498' : st.type === 'AnyState' ? '#57a5e0' : st.type === 'ExitState' ? '#ff5c5c' : '#3a3a3a';
            return (
              <div
                key={st.id}
                data-state-node
                className="absolute group rounded-md flex items-center px-3 text-[12px] select-none"
                style={{
                  left: p.x + pan.x,
                  top: p.y + pan.y,
                  width: NODE_W,
                  height: NODE_H,
                  background: special ? '#232323' : '#2c2c2c',
                  border: `1.5px solid ${sel ? '#57a5e0' : color}`,
                  cursor: 'grab',
                }}
                onPointerDown={(e) => e.button === 0 && dragNode(e, st, i)}
                onContextMenu={(e) => {
                  s.set('smSelection', { kind: 'state', id: st.id });
                  const special = ['EntryState', 'AnyState', 'ExitState'].includes(st.type);
                  openContextMenu(e, [
                    ...(st.type === 'AnimationState'
                      ? [
                          {
                            label: 'Timeline',
                            submenu: ab.animations.map(
                              (a): MenuItem => ({
                                label: String(a.props.name ?? 'Timeline'),
                                checked: st.props.animationId === a.id,
                                disabled: readOnly,
                                run: () =>
                                  editSM(ab.id, sm.id, (m) => {
                                    const w = (o: CoreObj) => {
                                      if (o.id === st.id) o.props.animationId = a.id;
                                      o.children?.forEach(w);
                                    };
                                    w(m);
                                  }),
                              }),
                            ),
                          } as MenuItem,
                          sep,
                        ]
                      : []),
                    { label: 'Delete state', danger: true, disabled: readOnly || special, run: () => deleteSmSelection() },
                  ]);
                }}
              >
                <span className="truncate flex-1" style={{ color: special ? color : '#eee' }}>
                  {stateLabel(ab, st)}
                </span>
                {!readOnly && st.type !== 'ExitState' && (
                  <div
                    className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-accent border-2 border-bg1 opacity-0 group-hover:opacity-100 cursor-crosshair"
                    title="Drag to another state to add a transition"
                    onPointerDown={(e) => startLink(e, st)}
                  />
                )}
              </div>
            );
          })}
          <div className="absolute left-2 bottom-2 text-t3 text-[11px] pointer-events-none">
            Drag the blue dot on a state to create a transition. Drag empty space to pan.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector for the selected state machine element

const OPS = [
  { value: 0, label: '==' },
  { value: 1, label: '!=' },
  { value: 2, label: '<=' },
  { value: 3, label: '>=' },
  { value: 4, label: '<' },
  { value: 5, label: '>' },
];

const LISTENER_TYPES = [
  { value: 2, label: 'Pointer Down' },
  { value: 3, label: 'Pointer Up' },
  { value: 6, label: 'Click' },
  { value: 0, label: 'Pointer Enter' },
  { value: 1, label: 'Pointer Exit' },
  { value: 4, label: 'Pointer Move' },
];

export function StateMachineInspector() {
  const { ab, sm, layer } = useSM();
  const smSelection = useEditor((s) => s.smSelection);
  const readOnly = useEditor((s) => s.readOnly);
  if (!ab || !sm || !smSelection) return null;
  const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput'));
  const s = useEditor.getState();

  // locate selected object anywhere in the SM tree
  let target: CoreObj | undefined;
  let parent: CoreObj | undefined;
  const walk = (o: CoreObj, p?: CoreObj) => {
    if (o.id === smSelection.id) {
      target = o;
      parent = p;
    }
    o.children?.forEach((c) => walk(c, o));
  };
  walk(sm);
  if (!target) return <div className="section text-t2">Nothing selected</div>;
  const t = target;
  const set = (values: Record<string, unknown>, transient = false) =>
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const m = a.stateMachines.find((x) => x.id === sm.id)!;
      const w = (o: CoreObj) => {
        if (o.id === t.id) Object.assign(o.props, values);
        o.children?.forEach(w);
      };
      w(m);
    }, transient);
  const mutate = (fn: (o: CoreObj) => void) =>
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const m = a.stateMachines.find((x) => x.id === sm.id)!;
      const w = (o: CoreObj) => {
        if (o.id === t.id) fn(o);
        o.children?.forEach(w);
      };
      w(m);
    });
  const removeSelf = () => deleteSmSelection();
  const canDelete = !readOnly && !['EntryState', 'AnyState', 'ExitState'].includes(t.type);
  const header = (title: string) => (
    <div className="flex items-center mb-2">
      <span className="panel-title flex-1">{title}</span>
      {canDelete && (
        <button className="icon-btn" onClick={removeSelf} title="Delete">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  if (isA(t.type, 'StateMachineInput')) {
    return (
      <div className="section flex flex-col gap-2">
        {header(t.type === 'StateMachineNumber' ? 'Number input' : t.type === 'StateMachineBool' ? 'Boolean input' : 'Trigger input')}
        <Row label="Name">
          <TextField value={String(t.props.name ?? '')} onChange={(v) => set({ name: v })} />
        </Row>
        {t.type === 'StateMachineNumber' && (
          <Row label="Default">
            <NumberField value={prop(t, 'value')} onChange={(v, tr) => set({ value: v }, tr)} disabled={readOnly} />
          </Row>
        )}
        {t.type === 'StateMachineBool' && (
          <Row label="Default">
            <input type="checkbox" checked={prop<boolean>(t, 'value')} disabled={readOnly} onChange={(e) => set({ value: e.target.checked })} />
          </Row>
        )}
      </div>
    );
  }

  if (isA(t.type, 'LayerState')) {
    const transitions = (t.children ?? []).filter((c) => isA(c.type, 'StateTransition'));
    return (
      <div className="section flex flex-col gap-2">
        {header(stateLabel(ab, t))}
        {t.type === 'AnimationState' && (
          <>
            <Row label="Timeline">
              <Select
                value={String(t.props.animationId ?? '')}
                options={[{ value: '', label: 'None' }, ...ab.animations.map((a) => ({ value: a.id, label: String(a.props.name ?? 'Timeline') }))]}
                onChange={(v) => set({ animationId: v })}
              />
            </Row>
            <Row label="Speed">
              <NumberField value={prop(t, 'speed')} step={0.05} onChange={(v, tr) => set({ speed: v }, tr)} disabled={readOnly} />
            </Row>
          </>
        )}
        <div className="label mt-1">Transitions out</div>
        {transitions.length === 0 && <div className="text-t3">None. Drag from the blue dot on the state.</div>}
        {transitions.map((tr) => {
          const to = layer?.children?.find((c) => c.id === tr.props.stateToId);
          return (
            <button key={tr.id} className="text-left px-2 py-1 rounded bg-bg2 hover:bg-bg3" onClick={() => s.set('smSelection', { kind: 'transition', id: tr.id })}>
              → {to ? stateLabel(ab, to) : '?'} {(tr.children ?? []).length ? `(${tr.children!.length} conditions)` : ''}
            </button>
          );
        })}
      </div>
    );
  }

  if (isA(t.type, 'StateTransition')) {
    const flags = prop(t, 'flags');
    const setFlag = (bit: number, on: boolean) => set({ flags: on ? flags | bit : flags & ~bit });
    const to = layer?.children?.find((c) => c.id === t.props.stateToId);
    const conditions = (t.children ?? []).filter((c) => isA(c.type, 'TransitionCondition'));
    const addCondition = (inputId: string) => {
      const input = inputs.find((i) => i.id === inputId);
      if (!input) return;
      const type =
        input.type === 'StateMachineNumber'
          ? 'TransitionNumberCondition'
          : input.type === 'StateMachineBool'
            ? 'TransitionBoolCondition'
            : 'TransitionTriggerCondition';
      mutate((o) => (o.children ??= []).push(obj(type, { inputId, ...(type === 'TransitionNumberCondition' ? { opValue: 0, value: 0 } : {}) })));
    };
    const setCond = (id: string, values: Record<string, unknown>) =>
      mutate((o) => {
        const c = o.children?.find((x) => x.id === id);
        if (c) Object.assign(c.props, values);
      });
    const removeCond = (id: string) => mutate((o) => (o.children = o.children?.filter((x) => x.id !== id)));
    return (
      <div className="section flex flex-col gap-2">
        {header(`${parent ? stateLabel(ab, parent) : '?'} → ${to ? stateLabel(ab, to) : '?'}`)}
        <Row label="Duration">
          <NumberField value={prop(t, 'duration')} precision={0} min={0} disabled={readOnly} onChange={(v, tr) => set({ duration: Math.round(v) }, tr)} />
          <Select
            className="w-[70px] shrink-0"
            value={flags & 2 ? 'pct' : 'ms'}
            options={[
              { value: 'ms', label: 'ms' },
              { value: 'pct', label: '%' },
            ]}
            onChange={(v) => setFlag(2, v === 'pct')}
          />
        </Row>
        <Row label="Exit time">
          <input type="checkbox" checked={!!(flags & 4)} disabled={readOnly} onChange={(e) => setFlag(4, e.target.checked)} />
          <NumberField value={prop(t, 'exitTime')} precision={0} min={0} disabled={readOnly || !(flags & 4)} onChange={(v, tr) => set({ exitTime: Math.round(v) }, tr)} />
          <Select
            className="w-[70px] shrink-0"
            value={flags & 8 ? 'pct' : 'ms'}
            options={[
              { value: 'ms', label: 'ms' },
              { value: 'pct', label: '%' },
            ]}
            onChange={(v) => setFlag(8, v === 'pct')}
          />
        </Row>
        <label className="flex items-center gap-2 text-t1">
          <input type="checkbox" checked={!!(flags & 16)} disabled={readOnly} onChange={(e) => setFlag(16, e.target.checked)} /> Pause when exiting
        </label>
        <label className="flex items-center gap-2 text-t1">
          <input type="checkbox" checked={!!(flags & 32)} disabled={readOnly} onChange={(e) => setFlag(32, e.target.checked)} /> Enable early exit
        </label>
        <label className="flex items-center gap-2 text-t1">
          <input type="checkbox" checked={!!(flags & 1)} disabled={readOnly} onChange={(e) => setFlag(1, e.target.checked)} /> Disabled
        </label>
        <div className="label mt-2">Conditions (all must be true)</div>
        {conditions.map((c) => {
          const input = inputs.find((i) => i.id === c.props.inputId);
          return (
            <div key={c.id} className="flex items-center gap-1.5 bg-bg2 rounded p-1.5">
              <span className="truncate flex-1">{input ? String(input.props.name) : 'missing input'}</span>
              {c.type === 'TransitionNumberCondition' && (
                <>
                  <Select className="w-14 shrink-0" value={prop(c, 'opValue')} options={OPS} onChange={(v) => setCond(c.id, { opValue: v })} />
                  <div className="w-16 shrink-0">
                    <NumberField value={prop(c, 'value')} onChange={(v) => setCond(c.id, { value: v })} disabled={readOnly} />
                  </div>
                </>
              )}
              {c.type === 'TransitionBoolCondition' && (
                <Select
                  className="w-20 shrink-0"
                  value={prop(c, 'opValue')}
                  options={[
                    { value: 0, label: 'is true' },
                    { value: 1, label: 'is false' },
                  ]}
                  onChange={(v) => setCond(c.id, { opValue: v })}
                />
              )}
              {c.type === 'TransitionTriggerCondition' && <span className="text-t2">fired</span>}
              {!readOnly && (
                <button className="icon-btn w-5 h-5" onClick={() => removeCond(c.id)}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <Select
            value=""
            options={[{ value: '', label: inputs.length ? '+ Add condition…' : 'Add inputs first' }, ...inputs.map((i) => ({ value: i.id, label: String(i.props.name) }))]}
            onChange={(v) => v && addCondition(v)}
          />
        )}
      </div>
    );
  }

  if (isA(t.type, 'StateMachineListener')) {
    const actions = (t.children ?? []).filter((c) => isA(c.type, 'ListenerAction'));
    const shapes = ab.objects.filter((o) => isA(o.type, 'Node') && o.type !== 'Artboard');
    const addAction = (inputId: string) => {
      const input = inputs.find((i) => i.id === inputId);
      if (!input) return;
      const type =
        input.type === 'StateMachineNumber' ? 'ListenerNumberChange' : input.type === 'StateMachineBool' ? 'ListenerBoolChange' : 'ListenerTriggerChange';
      mutate((o) => (o.children ??= []).push(obj(type, { inputId, ...(type === 'ListenerBoolChange' ? { value: 1 } : {}) })));
    };
    const setAction = (id: string, values: Record<string, unknown>) =>
      mutate((o) => {
        const c = o.children?.find((x) => x.id === id);
        if (c) Object.assign(c.props, values);
      });
    return (
      <div className="section flex flex-col gap-2">
        {header('Listener')}
        <Row label="Name">
          <TextField value={String(t.props.name ?? '')} onChange={(v) => set({ name: v })} />
        </Row>
        <Row label="Target">
          <Select
            value={String(t.props.targetId ?? '')}
            options={[{ value: '', label: 'Artboard' }, ...shapes.map((o) => ({ value: o.id, label: displayName(o) }))]}
            onChange={(v) => set({ targetId: v || undefined })}
          />
        </Row>
        <Row label="Event">
          <Select value={prop(t, 'listenerTypeValue')} options={LISTENER_TYPES} onChange={(v) => set({ listenerTypeValue: v })} />
        </Row>
        <div className="label mt-2">Actions</div>
        {actions.map((a) => {
          const input = inputs.find((i) => i.id === a.props.inputId);
          return (
            <div key={a.id} className="flex items-center gap-1.5 bg-bg2 rounded p-1.5">
              <span className="truncate flex-1">{input ? String(input.props.name) : 'missing input'}</span>
              {a.type === 'ListenerBoolChange' && (
                <Select
                  className="w-20 shrink-0"
                  value={prop(a, 'value')}
                  options={[
                    { value: 1, label: 'true' },
                    { value: 0, label: 'false' },
                    { value: 2, label: 'toggle' },
                  ]}
                  onChange={(v) => setAction(a.id, { value: v })}
                />
              )}
              {a.type === 'ListenerNumberChange' && (
                <div className="w-16 shrink-0">
                  <NumberField value={prop(a, 'value')} onChange={(v) => setAction(a.id, { value: v })} disabled={readOnly} />
                </div>
              )}
              {a.type === 'ListenerTriggerChange' && <span className="text-t2">fire</span>}
              {!readOnly && (
                <button className="icon-btn w-5 h-5" onClick={() => mutate((o) => (o.children = o.children?.filter((x) => x.id !== a.id)))}>
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
        {!readOnly && (
          <Select
            value=""
            options={[{ value: '', label: inputs.length ? '+ Add action…' : 'Add inputs first' }, ...inputs.map((i) => ({ value: i.id, label: String(i.props.name) }))]}
            onChange={(v) => v && addAction(v)}
          />
        )}
      </div>
    );
  }
  return <div className="section text-t2">{t.type}</div>;
}

/** Deletes the selected state / transition / input / listener of the active state machine. */
export function deleteSmSelection() {
  const s = useEditor.getState();
  const sel = s.smSelection;
  if (!sel || !s.doc || s.readOnly) return;
  const ab = findArtboard(s.doc, s.activeArtboardId);
  const sm = ab?.stateMachines.find((m) => m.id === s.stateMachineId);
  if (!ab || !sm) return;
  let target: CoreObj | undefined;
  const find = (o: CoreObj) => {
    if (o.id === sel.id) target = o;
    o.children?.forEach(find);
  };
  find(sm);
  if (!target || ['EntryState', 'AnyState', 'ExitState'].includes(target.type)) return;
  const id = target.id;
  s.commit((d) => {
    const m = findArtboard(d, ab.id)!.stateMachines.find((x) => x.id === sm.id)!;
    const w = (o: CoreObj) => {
      if (!o.children) return;
      o.children = o.children.filter(
        (c) =>
          c.id !== id &&
          // transitions into a deleted state, and conditions / actions on a deleted input
          !(isA(c.type, 'StateTransition') && c.props.stateToId === id) &&
          !(isA(c.type, 'TransitionInputCondition') && c.props.inputId === id) &&
          !(isA(c.type, 'ListenerInputChange') && c.props.inputId === id),
      );
      o.children.forEach(w);
    };
    w(m);
  });
  s.set('smSelection', null);
}
