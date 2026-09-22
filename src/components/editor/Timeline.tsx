'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Film,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Trash2,
  Workflow,
  ArrowRightLeft,
} from 'lucide-react';
import { ArtboardDoc, CoreObj, deepClone, newId } from '@/lib/rive/document';
import { newAnimation, newStateMachine } from '@/lib/rive/factory';
import {
  allKeyframes,
  EASE_PRESETS,
  findArtboard,
  findObj,
  propNameForKey,
  removeKeyframes,
  setInterpolation,
  walkTree,
} from '@/lib/rive/ops';
import { prop } from '@/lib/rive/scene';
import { animationFrames, useActiveArtboard, useEditor } from '@/lib/store/editor';
import { NumberField, Select } from './controls';
import { act, MenuItem, openContextMenu, sep } from './ContextMenu';
import { displayName } from './Hierarchy';
import { StateMachineGraph } from './StateMachinePanel';

const PROP_LABELS: Record<string, string> = {
  x: 'X',
  y: 'Y',
  rotation: 'Rotation',
  scaleX: 'Scale X',
  scaleY: 'Scale Y',
  opacity: 'Opacity',
  width: 'Width',
  height: 'Height',
  colorValue: 'Color',
  thickness: 'Thickness',
  cornerRadiusTL: 'Corner Radius',
  start: 'Trim Start',
  end: 'Trim End',
  offset: 'Trim Offset',
};

export function AnimatePanel() {
  const ab = useActiveArtboard();
  const stateMachineId = useEditor((s) => s.stateMachineId);
  const height = useEditor((s) => s.timelineHeight);
  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = height;
    const move = (ev: PointerEvent) =>
      useEditor.getState().set('timelineHeight', Math.min(window.innerHeight - 200, Math.max(160, h0 - (ev.clientY - y0))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  if (!ab) return null;
  return (
    <div className="flex border-t border-line bg-bg1 relative" style={{ height }}>
      <div className="absolute -top-1 left-0 right-0 h-2 cursor-ns-resize z-10" onPointerDown={startResize} />
      <AnimationList ab={ab} />
      {stateMachineId ? <StateMachineGraph /> : <TimelineView ab={ab} />}
    </div>
  );
}

function AnimationList({ ab }: { ab: ArtboardDoc }) {
  const animationId = useEditor((s) => s.animationId);
  const stateMachineId = useEditor((s) => s.stateMachineId);
  const readOnly = useEditor((s) => s.readOnly);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [showTimelines, setShowTimelines] = useState(true);
  const [showSMs, setShowSMs] = useState(true);
  const s = useEditor.getState();

  const uniqueName = (base: string, list: CoreObj[]) => {
    let i = list.length + 1;
    while (list.some((a) => a.props.name === `${base} ${i}`)) i++;
    return `${base} ${i}`;
  };

  const addTimeline = () => {
    const a = newAnimation(uniqueName('Timeline', ab.animations));
    s.commit((d) => {
      findArtboard(d, ab.id)!.animations.push(a);
    });
    s.setAnimation(a.id);
  };
  const addSM = () => {
    const sm = newStateMachine(uniqueName('State Machine', ab.stateMachines), ab.animations[0]?.id);
    s.commit((d) => {
      findArtboard(d, ab.id)!.stateMachines.push(sm);
    });
    s.setStateMachine(sm.id);
  };
  const rename = (id: string, name: string) => {
    setRenaming(null);
    if (!name.trim()) return;
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const t = a.animations.find((x) => x.id === id) ?? a.stateMachines.find((x) => x.id === id);
      if (t) t.props.name = name.trim();
    });
  };
  const remove = (id: string) => {
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      a.animations = a.animations.filter((x) => x.id !== id);
      a.stateMachines = a.stateMachines.filter((x) => x.id !== id);
    });
    if (id === animationId) s.setAnimation(ab.animations.find((a) => a.id !== id)?.id ?? null);
    if (id === stateMachineId) s.setStateMachine(null);
  };
  const duplicate = (id: string) => {
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const src = a.animations.find((x) => x.id === id) ?? a.stateMachines.find((x) => x.id === id);
      if (!src) return;
      const copy = deepClone(src) as CoreObj;
      // new ids, keeping internal references (states/inputs) consistent
      const map = new Map<string, string>();
      walkTree(copy, (n) => {
        const nid = newId();
        map.set(n.id, nid);
        n.id = nid;
      });
      walkTree(copy, (n) => {
        for (const [k, v] of Object.entries(n.props)) if (typeof v === 'string' && map.has(v) && k !== 'name') n.props[k] = map.get(v);
      });
      copy.props.name = `${src.props.name ?? ''} Copy`;
      if (src.type === 'StateMachine') a.stateMachines.push(copy);
      else a.animations.push(copy);
    });
  };

  const item = (o: CoreObj, isSM: boolean) => {
    const active = isSM ? stateMachineId === o.id : !stateMachineId && animationId === o.id;
    return (
      <div
        key={o.id}
        className={`flex items-center gap-2 h-7 px-3 cursor-default ${active ? 'bg-[#2a4a66]' : 'hover:bg-bg2'}`}
        onClick={() => (isSM ? s.setStateMachine(o.id) : s.setAnimation(o.id))}
        onDoubleClick={() => !readOnly && setRenaming(o.id)}
        onContextMenu={(e) =>
          openContextMenu(e, [
            { label: isSM ? 'Open state machine' : 'Open timeline', run: () => (isSM ? s.setStateMachine(o.id) : s.setAnimation(o.id)) },
            sep,
            { label: 'Rename', disabled: readOnly, run: () => setRenaming(o.id) },
            { label: 'Duplicate', icon: <Copy size={12} />, disabled: readOnly, run: () => duplicate(o.id) },
            sep,
            { label: 'Delete', icon: <Trash2 size={12} />, danger: true, disabled: readOnly, run: () => remove(o.id) },
          ])
        }
      >
        <span className={isSM ? 'text-accent' : 'text-anim'}>{isSM ? <Workflow size={13} /> : <Film size={13} />}</span>
        {renaming === o.id ? (
          <input
            autoFocus
            className="field h-5"
            defaultValue={String(o.props.name ?? '')}
            onBlur={(e) => rename(o.id, e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') rename(o.id, (e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <span className="truncate flex-1">{String(o.props.name || (isSM ? 'State Machine' : 'Timeline'))}</span>
        )}
      </div>
    );
  };

  return (
    <div className="w-[220px] shrink-0 border-r border-line flex flex-col overflow-auto">
      <div className="flex items-center h-8 px-2 border-b border-line">
        <button className="flex items-center gap-1 flex-1 panel-title" onClick={() => setShowTimelines(!showTimelines)}>
          {showTimelines ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Timelines
        </button>
        <button className="icon-btn" disabled={readOnly} onClick={addTimeline} title="New timeline">
          <Plus size={14} />
        </button>
      </div>
      {showTimelines && ab.animations.map((a) => item(a, false))}
      <div className="flex items-center h-8 px-2 border-y border-line mt-1">
        <button className="flex items-center gap-1 flex-1 panel-title" onClick={() => setShowSMs(!showSMs)}>
          {showSMs ? <ChevronDown size={12} /> : <ChevronRight size={12} />} State Machines
        </button>
        <button className="icon-btn" disabled={readOnly} onClick={addSM} title="New state machine">
          <Plus size={14} />
        </button>
      </div>
      {showSMs && ab.stateMachines.map((m) => item(m, true))}
    </div>
  );
}

// ---------------------------------------------------------------------------

interface Track {
  key: string;
  label: string;
  depth: number;
  objId: string;
  keyframes: CoreObj[];
  isGroup: boolean;
}

function TimelineView({ ab }: { ab: ArtboardDoc }) {
  const animationId = useEditor((s) => s.animationId);
  const frame = useEditor((s) => s.frame);
  const playing = useEditor((s) => s.playing);
  const selectedKeyframes = useEditor((s) => s.selectedKeyframes);
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  const anim = ab.animations.find((a) => a.id === animationId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pxPerFrame, setPxPerFrame] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaW, setAreaW] = useState(600);
  const s = useEditor.getState();

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [anim]);

  const tracks = useMemo(() => {
    const out: Track[] = [];
    if (!anim) return out;
    for (const ko of anim.children ?? []) {
      if (ko.type !== 'KeyedObject') continue;
      const target = typeof ko.props.objectId === 'string' ? findObj(ab, ko.props.objectId) : undefined;
      if (!target) continue;
      const kps = ko.children ?? [];
      const all = kps.flatMap((kp) => kp.children ?? []);
      out.push({ key: ko.id, label: targetLabel(ab, target), depth: 0, objId: target.id, keyframes: all, isGroup: true });
      if (collapsed.has(ko.id)) continue;
      for (const kp of kps) {
        const name = propNameForKey(prop(kp, 'propertyKey'));
        out.push({
          key: kp.id,
          label: PROP_LABELS[name] ?? name,
          depth: 1,
          objId: target.id,
          keyframes: kp.children ?? [],
          isGroup: false,
        });
      }
    }
    return out;
  }, [anim, ab, collapsed]);

  if (!anim) {
    return <div className="flex-1 flex items-center justify-center text-t2">Create or select a timeline to start animating.</div>;
  }
  const f = animationFrames(anim);
  const LEFT = 0;
  const ppf = pxPerFrame ?? Math.max(1, (areaW - 40) / Math.max(1, f.duration));
  const xOf = (fr: number) => LEFT + 16 + fr * ppf;
  const frameAt = (x: number) => Math.round((x - LEFT - 16) / ppf);
  const setAnimProps = (values: Record<string, unknown>) =>
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!.animations.find((x) => x.id === anim.id);
      if (a) Object.assign(a.props, values);
    });

  const scrub = (e: React.PointerEvent) => {
    const el = areaRef.current!;
    const rect = el.getBoundingClientRect();
    const at = (ev: { clientX: number }) =>
      s.setFrame(Math.min(f.duration, Math.max(0, frameAt(ev.clientX - rect.left + el.scrollLeft))));
    at(e);
    s.set('playing', false);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startKeyDrag = (e: React.PointerEvent, clicked: CoreObj[]) => {
    e.stopPropagation();
    if (readOnly || !clicked.length) return;
    const ids = clicked.map((k) => k.id);
    let sel = useEditor.getState().selectedKeyframes;
    if (e.shiftKey) {
      sel = ids.every((id) => sel.includes(id)) ? sel.filter((x) => !ids.includes(x)) : [...new Set([...sel, ...ids])];
    } else if (!ids.every((id) => sel.includes(id))) {
      sel = ids;
    }
    const kf = clicked[0];
    s.set('selectedKeyframes', sel);
    s.setFrame(prop(kf, 'frame'));
    // drag to move
    const startX = e.clientX;
    const startFrames = new Map<string, number>();
    for (const { kf: k } of allKeyframes(anim)) if (sel.includes(k.id)) startFrames.set(k.id, prop(k, 'frame'));
    s.beginGesture();
    const move = (ev: PointerEvent) => {
      const df = Math.round((ev.clientX - startX) / ppf);
      s.commit((d) => {
        const a = findArtboard(d, ab.id)!.animations.find((x) => x.id === anim.id)!;
        for (const { kf: k } of allKeyframes(a)) {
          const f0 = startFrames.get(k.id);
          if (f0 !== undefined) k.props.frame = Math.max(0, f0 + df);
        }
      });
      if (startFrames.has(kf.id)) s.setFrame(Math.max(0, (startFrames.get(kf.id) ?? 0) + df));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // merge keys that landed on the same frame (last moved wins)
      s.commit((d) => {
        const a = findArtboard(d, ab.id)!.animations.find((x) => x.id === anim.id)!;
        for (const ko of a.children ?? []) {
          for (const kp of ko.children ?? []) {
            const byFrame = new Map<number, CoreObj>();
            for (const k of kp.children ?? []) {
              const fr = prop(k, 'frame');
              const existing = byFrame.get(fr);
              if (!existing || startFrames.has(k.id)) byFrame.set(fr, k);
            }
            kp.children = [...byFrame.values()].sort((x, y) => prop(x, 'frame') - prop(y, 'frame'));
          }
        }
      });
      s.endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ROW = 24;
  const selectedKfObjs = allKeyframes(anim)
    .filter(({ kf }) => selectedKeyframes.includes(kf.id))
    .map(({ kf }) => kf);

  const onAreaPointerDown = (e: React.PointerEvent) => {
    const el = areaRef.current!;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left + el.scrollLeft;
    const y = e.clientY - rect.top + el.scrollTop;
    if (!e.shiftKey) s.set('selectedKeyframes', []);
    setMarquee({ x0: x, y0: y, x1: x, y1: y });
    const move = (ev: PointerEvent) =>
      setMarquee((m) => (m ? { ...m, x1: ev.clientX - rect.left + el.scrollLeft, y1: ev.clientY - rect.top + el.scrollTop } : m));
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const x1 = ev.clientX - rect.left + el.scrollLeft;
      const y1 = ev.clientY - rect.top + el.scrollTop;
      const minX = Math.min(x, x1), maxX = Math.max(x, x1), minY = Math.min(y, y1) - 28, maxY = Math.max(y, y1) - 28;
      const ids: string[] = [];
      tracks.forEach((t, i) => {
        if (t.isGroup) return;
        const cy = i * ROW + ROW / 2;
        if (cy < minY || cy > maxY) return;
        for (const k of t.keyframes) {
          const kx = xOf(prop(k, 'frame'));
          if (kx >= minX && kx <= maxX) ids.push(k.id);
        }
      });
      if (Math.abs(x1 - x) > 3) s.set('selectedKeyframes', e.shiftKey ? [...new Set([...useEditor.getState().selectedKeyframes, ...ids])] : ids);
      setMarquee(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const ticks: React.ReactNode[] = [];
  const minTickPx = 50;
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const step = steps.find((st) => st * ppf >= minTickPx) ?? 600;
  for (let fr = 0; fr <= f.duration; fr += step) {
    ticks.push(
      <div key={fr} className="absolute top-0 h-full border-l border-line2" style={{ left: xOf(fr) }}>
        <span className="absolute top-1 left-1 text-[10px] text-t2 whitespace-nowrap">
          {fr % f.fps === 0 ? `${fr / f.fps}s` : fr}
        </span>
      </div>,
    );
  }
  const totalW = xOf(f.duration) + 40;
  const workStart = f.enableWorkArea && f.workStart >= 0 ? f.workStart : null;
  const workEnd = f.enableWorkArea && f.workEnd >= 0 ? f.workEnd : null;

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        {/* toolbar */}
        <div className="h-8 flex items-center gap-1 px-2 border-b border-line shrink-0">
          <button className="icon-btn" onClick={() => s.setFrame(workStart ?? 0)} title="Go to start">
            <SkipBack size={14} />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              if (!playing && frame >= (workEnd ?? f.duration) && f.loop === 0) s.setFrame(workStart ?? 0);
              s.set('playing', !playing);
            }}
            title="Play / pause (Space)"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button className="icon-btn" onClick={() => s.setFrame(workEnd ?? f.duration)} title="Go to end">
            <SkipForward size={14} />
          </button>
          <div className="w-[70px] ml-1">
            <NumberField value={Math.round(frame)} precision={0} min={0} max={f.duration} onChange={(v) => s.setFrame(v)} />
          </div>
          <span className="text-t2 text-[11px] w-14">{(frame / f.fps).toFixed(2)}s</span>
          <div className="w-px h-4 bg-line2 mx-1" />
          <span className="label">Duration</span>
          <div className="w-[64px]">
            <NumberField
              value={f.duration / f.fps}
              precision={2}
              step={0.05}
              min={1 / f.fps}
              suffix="s"
              disabled={readOnly}
              onChange={(v) => setAnimProps({ duration: Math.max(1, Math.round(v * f.fps)) })}
            />
          </div>
          <span className="label ml-1">FPS</span>
          <div className="w-[48px]">
            <NumberField value={f.fps} precision={0} min={1} max={240} disabled={readOnly} onChange={(v) => setAnimProps({ fps: Math.round(v) })} />
          </div>
          <span className="label ml-1">Speed</span>
          <div className="w-[52px]">
            <NumberField value={f.speed} precision={2} step={0.05} disabled={readOnly} onChange={(v) => setAnimProps({ speed: v })} />
          </div>
          <div className="flex bg-bg3 rounded ml-1">
            {[
              { v: 0, icon: <ArrowRightLeft size={13} className="rotate-0" />, t: 'One shot' },
              { v: 1, icon: <Repeat size={13} />, t: 'Loop' },
              { v: 2, icon: <Repeat1 size={13} />, t: 'Ping pong' },
            ].map((o) => (
              <button
                key={o.v}
                disabled={readOnly}
                className={`icon-btn ${f.loop === o.v ? 'active' : ''}`}
                onClick={() => setAnimProps({ loopValue: o.v })}
                title={o.t}
              >
                {o.v === 0 ? <span className="text-[10px] font-semibold">1×</span> : o.icon}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1 ml-2 text-t1">
            <input
              type="checkbox"
              checked={f.enableWorkArea}
              disabled={readOnly}
              onChange={(e) =>
                setAnimProps({
                  enableWorkArea: e.target.checked,
                  ...(e.target.checked && f.workStart < 0 ? { workStart: 0, workEnd: f.duration } : {}),
                })
              }
            />
            Work area
          </label>
          <div className="flex-1" />
          <button className="icon-btn" onClick={() => setPxPerFrame(Math.max(0.5, ppf / 1.4))} title="Zoom out">
            −
          </button>
          <button className="icon-btn" onClick={() => setPxPerFrame(null)} title="Fit">
            ⤢
          </button>
          <button className="icon-btn" onClick={() => setPxPerFrame(Math.min(80, ppf * 1.4))} title="Zoom in">
            +
          </button>
        </div>
        <div className="flex-1 flex min-h-0">
          {/* track labels */}
          <div className="w-[190px] shrink-0 border-r border-line overflow-hidden">
            <div className="h-7 border-b border-line flex items-center px-2 text-t2 text-[11px]">
              {tracks.length ? 'Keyed properties' : 'Change a property to add a key'}
            </div>
            {tracks.map((t) => (
              <div
                key={t.key}
                className={`h-6 flex items-center gap-1 pr-2 truncate cursor-default ${
                  selection.includes(t.objId) && t.isGroup ? 'text-accent' : t.isGroup ? 'text-t0' : 'text-t1'
                }`}
                style={{ paddingLeft: 6 + t.depth * 16 }}
                onClick={() => t.isGroup && s.select([t.objId])}
              >
                {t.isGroup && (
                  <button
                    className="text-t2"
                    onClick={(e) => {
                      e.stopPropagation();
                      const n = new Set(collapsed);
                      if (n.has(t.key)) n.delete(t.key);
                      else n.add(t.key);
                      setCollapsed(n);
                    }}
                  >
                    {collapsed.has(t.key) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  </button>
                )}
                <span className="truncate">{t.label}</span>
              </div>
            ))}
          </div>
          {/* keyframe area */}
          <div
            ref={areaRef}
            className="flex-1 overflow-auto relative"
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setPxPerFrame(Math.min(80, Math.max(0.5, ppf * Math.exp(-e.deltaY * 0.005))));
              }
            }}
          >
            <div style={{ width: totalW, minHeight: '100%' }} className="relative">
              <div className="h-7 border-b border-line sticky top-0 bg-bg1 z-10 cursor-ew-resize" onPointerDown={scrub}>
                {ticks}
                {workStart !== null && workEnd !== null && (
                  <div
                    className="absolute bottom-0 h-1.5 bg-accent/60"
                    style={{ left: xOf(workStart), width: (workEnd - workStart) * ppf }}
                  />
                )}
              </div>
              <div className="relative" onPointerDown={onAreaPointerDown} style={{ minHeight: tracks.length * ROW + 40 }}>
                {tracks.map((t, i) => (
                  <div key={t.key} className={`absolute left-0 right-0 h-6 ${t.isGroup ? 'bg-bg2/50' : ''}`} style={{ top: i * ROW }}>
                    {!t.isGroup && <Segments t={t} xOf={xOf} />}
                    {(t.isGroup ? dedupeFrames(t.keyframes) : t.keyframes).map((k) => {
                      const sel = t.isGroup
                        ? t.keyframes.some((kk) => prop(kk, 'frame') === prop(k, 'frame') && selectedKeyframes.includes(kk.id))
                        : selectedKeyframes.includes(k.id);
                      return (
                        <div
                          key={k.id}
                          className="absolute top-1/2 w-3 h-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer z-[2]"
                          style={{ left: xOf(prop(k, 'frame')) }}
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            startKeyDrag(e, t.isGroup ? t.keyframes.filter((kk) => prop(kk, 'frame') === prop(k, 'frame')) : [k]);
                          }}
                          onContextMenu={(e) => {
                            const clicked = t.isGroup ? t.keyframes.filter((kk) => prop(kk, 'frame') === prop(k, 'frame')) : [k];
                            const cur = useEditor.getState().selectedKeyframes;
                            if (!clicked.every((c) => cur.includes(c.id))) s.set('selectedKeyframes', clicked.map((c) => c.id));
                            openContextMenu(e, keyframeMenu(ab, anim));
                          }}
                        >
                          <svg viewBox="0 0 10 10" className="w-full h-full">
                            <path
                              d="M5 0.5 9.5 5 5 9.5 0.5 5Z"
                              fill={sel ? '#fff' : t.isGroup ? '#8a8a8a' : 'var(--key)'}
                              stroke={sel ? 'var(--accent)' : '#111'}
                              strokeWidth="1"
                            />
                          </svg>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {marquee && (
                  <div
                    className="absolute border border-accent bg-accent/10 z-20 pointer-events-none"
                    style={{
                      left: Math.min(marquee.x0, marquee.x1),
                      top: Math.min(marquee.y0, marquee.y1) - 28,
                      width: Math.abs(marquee.x1 - marquee.x0),
                      height: Math.abs(marquee.y1 - marquee.y0),
                    }}
                  />
                )}
              </div>
              {/* duration end + playhead */}
              <div className="absolute top-0 bottom-0 w-px bg-line2 pointer-events-none" style={{ left: xOf(f.duration) }} />
              <div className="absolute top-0 bottom-0 pointer-events-none z-20" style={{ left: xOf(frame) }}>
                <div className="absolute top-0 -translate-x-1/2 w-2.5 h-3 bg-accent rounded-b-sm" />
                <div className="absolute top-0 bottom-0 w-px bg-accent" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {selectedKfObjs.length > 0 && <KeyframeInspector ab={ab} anim={anim} kfs={selectedKfObjs} />}
    </div>
  );
}

function dedupeFrames(kfs: CoreObj[]) {
  const seen = new Set<number>();
  return kfs.filter((k) => {
    const f = prop(k, 'frame');
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
}

function Segments({ t, xOf }: { t: Track; xOf: (f: number) => number }) {
  const kfs = [...t.keyframes].sort((a, b) => prop(a, 'frame') - prop(b, 'frame'));
  return (
    <>
      {kfs.slice(0, -1).map((k, i) => {
        const x0 = xOf(prop(k, 'frame'));
        const x1 = xOf(prop(kfs[i + 1], 'frame'));
        const hold = prop(k, 'interpolationType') === 0;
        return (
          <div
            key={k.id}
            className="absolute top-1/2 h-[2px] -translate-y-1/2"
            style={{
              left: x0,
              width: x1 - x0,
              background: hold ? 'repeating-linear-gradient(90deg,#666 0 3px,transparent 3px 6px)' : '#6b5a20',
            }}
          />
        );
      })}
    </>
  );
}

function targetLabel(ab: ArtboardDoc, o: CoreObj): string {
  if (o.type === 'SolidColor' || o.type === 'GradientStop' || o.type.includes('Gradient') || o.type === 'TrimPath') {
    // show owner shape name for paints
    let cur: CoreObj | undefined = o;
    let guard = 0;
    while (cur && cur.type !== 'Shape' && cur.type !== 'Artboard' && guard++ < 5) {
      const pid: unknown = cur.props.parentId;
      cur = typeof pid === 'string' ? findObj(ab, pid) : ab.artboard;
    }
    const paint = typeof o.props.parentId === 'string' ? findObj(ab, o.props.parentId) : undefined;
    return `${cur ? displayName(cur) : ''} › ${paint ? displayName(paint) : displayName(o)}`;
  }
  return displayName(o);
}

// ---------------------------------------------------------------------------

function KeyframeInspector({ ab, anim, kfs }: { ab: ArtboardDoc; anim: CoreObj; kfs: CoreObj[] }) {
  const s = useEditor.getState();
  const readOnly = useEditor((st) => st.readOnly);
  const first = kfs[0];
  const type = prop(first, 'interpolationType');
  const interp = typeof first.props.interpolatorId === 'string' ? findObj(ab, first.props.interpolatorId) : undefined;
  const mode: 'hold' | 'linear' | 'cubic' = type === 0 ? 'hold' : interp ? 'cubic' : 'linear';
  const bez: [number, number, number, number] = interp
    ? [prop(interp, 'x1'), prop(interp, 'y1'), prop(interp, 'x2'), prop(interp, 'y2')]
    : EASE_PRESETS['Ease In Out'];
  const apply = (m: 'hold' | 'linear' | 'cubic', b?: [number, number, number, number], transient = false) =>
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const an = a.animations.find((x) => x.id === anim.id)!;
      const ids = new Set(kfs.map((k) => k.id));
      setInterpolation(
        a,
        allKeyframes(an)
          .filter(({ kf }) => ids.has(kf.id))
          .map(({ kf }) => kf),
        m,
        b,
      );
    }, transient);
  const del = () => {
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      removeKeyframes(a, a.animations.find((x) => x.id === anim.id)!, new Set(kfs.map((k) => k.id)));
    });
    s.set('selectedKeyframes', []);
  };
  const value = first.props.value;
  return (
    <div className="w-[230px] shrink-0 border-l border-line p-3 flex flex-col gap-2 overflow-auto">
      <div className="flex items-center">
        <span className="panel-title flex-1">
          {kfs.length} keyframe{kfs.length > 1 ? 's' : ''}
        </span>
        <button className="icon-btn" disabled={readOnly} onClick={del} title="Delete keys (Del)">
          <Trash2 size={13} />
        </button>
      </div>
      {kfs.length === 1 && typeof value === 'number' && first.type === 'KeyFrameDouble' && (
        <div className="flex items-center gap-2">
          <span className="label w-12">Value</span>
          <NumberField
            value={value}
            precision={3}
            disabled={readOnly}
            onChange={(v, t) =>
              s.commit((d) => {
                const a = findArtboard(d, ab.id)!;
                const k = allKeyframes(a.animations.find((x) => x.id === anim.id)!).find(({ kf }) => kf.id === first.id);
                if (k) k.kf.props.value = v;
              }, t)
            }
          />
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="label w-12">Frame</span>
        <span>{prop(first, 'frame')}</span>
      </div>
      <div className="label">Interpolation (to next key)</div>
      <div className="flex bg-bg3 rounded p-0.5">
        {(['hold', 'linear', 'cubic'] as const).map((m) => (
          <button
            key={m}
            disabled={readOnly}
            className={`flex-1 h-6 rounded capitalize ${mode === m ? 'bg-accent text-white' : 'text-t1'}`}
            onClick={() => apply(m, bez)}
          >
            {m}
          </button>
        ))}
      </div>
      {mode === 'cubic' && (
        <>
          <BezierEditor value={bez} onChange={(b, t) => apply('cubic', b, t)} disabled={readOnly} />
          <Select
            value={Object.entries(EASE_PRESETS).find(([, v]) => v.every((n, i) => Math.abs(n - bez[i]) < 1e-3))?.[0] ?? 'Custom'}
            options={[{ value: 'Custom', label: 'Custom' }, ...Object.keys(EASE_PRESETS).map((k) => ({ value: k, label: k }))]}
            onChange={(k) => k !== 'Custom' && apply('cubic', EASE_PRESETS[k])}
          />
          <div className="grid grid-cols-2 gap-1">
            {(['x1', 'y1', 'x2', 'y2'] as const).map((n, i) => (
              <NumberField
                key={n}
                label={n.toUpperCase()}
                value={bez[i]}
                precision={3}
                step={0.01}
                disabled={readOnly}
                onChange={(v, t) => {
                  const b = [...bez] as [number, number, number, number];
                  b[i] = i % 2 === 0 ? Math.min(1, Math.max(0, v)) : v;
                  apply('cubic', b, t);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BezierEditor({
  value,
  onChange,
  disabled,
}: {
  value: [number, number, number, number];
  onChange: (v: [number, number, number, number], transient: boolean) => void;
  disabled?: boolean;
}) {
  const W = 200;
  const H = 150;
  const pad = 24;
  const ix = (x: number) => pad + x * (W - pad * 2);
  const iy = (y: number) => H - pad - y * (H - pad * 2);
  const [x1, y1, x2, y2] = value;
  const drag = (which: 0 | 1) => (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const svg = (e.currentTarget as SVGElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    useEditor.getState().beginGesture();
    const move = (ev: PointerEvent) => {
      const x = Math.min(1, Math.max(0, (ev.clientX - rect.left - pad) / (W - pad * 2)));
      const y = (H - pad - (ev.clientY - rect.top)) / (H - pad * 2);
      const v = [...value] as [number, number, number, number];
      v[which * 2] = Math.round(x * 1000) / 1000;
      v[which * 2 + 1] = Math.round(y * 1000) / 1000;
      onChange(v, true);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      useEditor.getState().endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <svg width={W} height={H} className="bg-bg2 rounded">
      <rect x={ix(0)} y={iy(1)} width={ix(1) - ix(0)} height={iy(0) - iy(1)} fill="none" stroke="#333" />
      <line x1={ix(0)} y1={iy(0)} x2={ix(x1)} y2={iy(y1)} stroke="#57a5e0" />
      <line x1={ix(1)} y1={iy(1)} x2={ix(x2)} y2={iy(y2)} stroke="#57a5e0" />
      <path
        d={`M${ix(0)} ${iy(0)} C${ix(x1)} ${iy(y1)} ${ix(x2)} ${iy(y2)} ${ix(1)} ${iy(1)}`}
        fill="none"
        stroke="var(--key)"
        strokeWidth={2}
      />
      <circle cx={ix(x1)} cy={iy(y1)} r={5} fill="#fff" stroke="#57a5e0" style={{ cursor: 'grab' }} onPointerDown={drag(0)} />
      <circle cx={ix(x2)} cy={iy(y2)} r={5} fill="#fff" stroke="#57a5e0" style={{ cursor: 'grab' }} onPointerDown={drag(1)} />
    </svg>
  );
}

/** Right-click menu for selected keyframes. */
function keyframeMenu(ab: ArtboardDoc, anim: CoreObj): MenuItem[] {
  const s = useEditor.getState();
  const ids = new Set(s.selectedKeyframes);
  const setInterp = (mode: 'hold' | 'linear' | 'cubic', bezier?: [number, number, number, number]) =>
    s.commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const an = a.animations.find((x) => x.id === anim.id)!;
      setInterpolation(
        a,
        allKeyframes(an)
          .filter(({ kf }) => ids.has(kf.id))
          .map(({ kf }) => kf),
        mode,
        bezier,
      );
    });
  const frames = allKeyframes(anim)
    .filter(({ kf }) => ids.has(kf.id))
    .map(({ kf }) => prop(kf, 'frame'));
  return [
    {
      label: 'Interpolation',
      submenu: [
        { label: 'Hold', run: () => setInterp('hold') },
        { label: 'Linear', run: () => setInterp('linear') },
        sep,
        ...Object.entries(EASE_PRESETS).map(([name, v]): MenuItem => ({ label: name, run: () => setInterp('cubic', v) })),
      ],
    },
    {
      label: 'Go to key',
      disabled: !frames.length,
      run: () => {
        s.set('playing', false);
        s.setFrame(Math.min(...frames));
      },
    },
    {
      label: 'Select all keys at this frame',
      run: () => {
        const f = new Set(frames);
        s.set(
          'selectedKeyframes',
          allKeyframes(anim)
            .filter(({ kf }) => f.has(prop(kf, 'frame')))
            .map(({ kf }) => kf.id),
        );
      },
    },
    sep,
    act('edit.delete', { label: `Delete ${ids.size} key${ids.size === 1 ? '' : 's'}`, danger: true }),
  ];
}
