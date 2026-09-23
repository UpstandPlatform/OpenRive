'use client';
import { importAssetFiles, placeAssetOnArtboard } from './AssetsPanel';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StageEngine, EngineFrameState } from '@/lib/engine';
import { ArtboardDoc, CoreObj } from '@openrive/rive/document';
import {
  apply,
  Bounds,
  buildScene,
  emptyBounds,
  addPoint,
  hitTestShape,
  invert,
  isEmpty,
  Mat,
  mul,
  objectBounds,
  pathGeometry,
  pathsOfShape,
  prop,
  artboardPos,
  setArtboardPos,
  sampleAnimation,
  Scene,
  vertexControls,
} from '@openrive/rive/scene';
import { isA } from '@openrive/rive/schema';
import { findArtboard, findObj, insertObjects, isAncestor, parentIdOf } from '@openrive/rive/ops';
import { newArtboard, newParametricShape, newPenShape, PenPoint, ShapeKind, solidStroke } from '@openrive/rive/factory';
import { ensureFontAsset, newTextObjects, textBox, textRuns, textStyles } from '@openrive/rive/text';
import { getPrefs, usePrefs } from '@/lib/client/prefs';
import { loadBundledFont } from '@/lib/client/fonts';
import { openContextMenu } from './ContextMenu';
import { canvasMenu, objectMenu } from './menus';
import { animationFrames, getActive, useEditor } from '@/lib/store/editor';
import { engineRef } from './engineRef';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; panX: number; panY: number }
  | { kind: 'marquee'; abId: string; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | {
      kind: 'move';
      abId: string;
      sx: number;
      sy: number;
      start: Map<string, { x: number; y: number; inv: Mat }>;
      moved: boolean;
    }
  | { kind: 'moveArtboard'; ids: string[]; sx: number; sy: number; start: Map<string, { x: number; y: number }> }
  | {
      kind: 'resize';
      abId: string;
      id: string;
      handle: Handle;
      localInv: Mat; // artboard space -> object local
      box: Bounds; // object local
      startLocal: Mat; // object's local matrix linear part source
      x: number;
      y: number;
      sx: number;
      sy: number;
      rot: number;
      parametric: CoreObj | null;
      pw: number;
      ph: number;
    }
  | { kind: 'resizeArtboard'; abId: string; handle: Handle; x: number; y: number; w: number; h: number; sx: number; sy: number }
  | { kind: 'rotate'; abId: string; id: string; cx: number; cy: number; a0: number; rot0: number }
  | { kind: 'create'; tool: ShapeKind | 'artboard'; abId: string | null; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'penHandle'; index: number }
  | { kind: 'vertex'; abId: string; id: string; which: 'pt' | 'in' | 'out'; inv: Mat };

const HANDLE_CURSORS: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

export function Stage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<StageEngine | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [engineError, setEngineError] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pen, setPen] = useState<{ abId: string; points: PenPoint[]; cursor: [number, number] | null } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);

  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const tool = useEditor((s) => s.tool);
  const mode = useEditor((s) => s.mode);
  const selection = useEditor((s) => s.selection);
  const hoverId = useEditor((s) => s.hoverId);
  const activeArtboardId = useEditor((s) => s.activeArtboardId);
  const animationId = useEditor((s) => s.animationId);
  const frame = useEditor((s) => s.frame);
  const previewing = useEditor((s) => s.previewing);
  const editPathId = useEditor((s) => s.editPathId);
  const selectionContext = useEditor((s) => s.selectionContext);
  const selectMode = usePrefs((s) => s.prefs.selectMode);
  const readOnly = useEditor((s) => s.readOnly);
  const editTextId = useEditor((s) => s.editTextId);

  // ---- engine lifecycle -------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getState = (): EngineFrameState => {
      const s = useEditor.getState();
      const d = s.doc!;
      const abIndex = d.artboards.findIndex((a) => a.id === s.activeArtboardId);
      const ab = d.artboards[abIndex];
      const animIndex = ab ? ab.animations.findIndex((a) => a.id === s.animationId) : -1;
      const anim = ab?.animations[animIndex];
      const fps = anim ? animationFrames(anim).fps : 60;
      const smIndex = s.previewing && ab ? ab.stateMachines.findIndex((m) => m.id === s.stateMachineId) : -1;
      return {
        mode: s.mode,
        activeArtboardIndex: abIndex,
        animationIndex: s.mode === 'animate' ? animIndex : -1,
        time: s.frame / fps,
        previewStateMachineIndex: s.previewing ? Math.max(smIndex, s.previewing ? smIndex : -1) : -1,
        view: s.view,
        positions: d.artboards.map((a) => artboardPos(a.artboard)),
      };
    };
    const e = new StageEngine(canvas, getState);
    engine.current = e;
    engineRef.current = e;
    let playFrame = 0;
    e.onTick = (dt) => {
      const s = useEditor.getState();
      if (!s.playing || s.mode !== 'animate') {
        playFrame = s.frame;
        return;
      }
      const { anim } = getActive();
      if (!anim) return;
      const f = animationFrames(anim);
      const start = f.enableWorkArea && f.workStart >= 0 ? f.workStart : 0;
      const end = f.enableWorkArea && f.workEnd >= 0 ? f.workEnd : f.duration;
      if (Math.abs(playFrame - s.frame) > 1.01) playFrame = s.frame; // user scrubbed
      const dir = s.playDir;
      playFrame += dt * f.fps * f.speed * dir;
      if (playFrame >= end || playFrame < start) {
        if (f.loop === 0) {
          playFrame = Math.min(Math.max(playFrame, start), end);
          useEditor.setState({ playing: false });
        } else if (f.loop === 1) {
          playFrame = start + ((((playFrame - start) % (end - start)) + (end - start)) % (end - start));
        } else {
          const nd = playFrame >= end ? -1 : 1;
          playFrame = playFrame >= end ? end : start;
          useEditor.setState({ playDir: nd });
        }
      }
      useEditor.setState({ frame: playFrame });
    };
    const unsub = e.subscribe(() => setEngineError(e.error));
    e.init();
    return () => {
      unsub();
      e.dispose();
      engine.current = null;
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (doc) engine.current?.setDoc(doc);
  }, [doc]);

  // ---- sizing ------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(1, Math.floor(r.width)), h: Math.max(1, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
  }, [size]);

  const zoomToFit = useCallback(() => {
    const s = useEditor.getState();
    const d = s.doc;
    if (!d) return;
    const ab = findArtboard(d, s.activeArtboardId) ?? d.artboards[0];
    if (!ab) return;
    const p = artboardPos(ab.artboard);
    const w = prop(ab.artboard, 'width');
    const h = prop(ab.artboard, 'height');
    const r = wrapRef.current!.getBoundingClientRect();
    if (r.width < 200 || r.height < 150) return false;
    const zoom = Math.min(4, Math.max(0.05, Math.min((r.width - 120) / w, (r.height - 120) / h)));
    s.set('view', { zoom, panX: r.width / 2 - (p.x + w / 2) * zoom, panY: r.height / 2 - (p.y + h / 2) * zoom });
    return true;
  }, []);
  // center the first artboard on load
  const centered = useRef<string | null>(null);
  const projectId = useEditor((s) => s.projectId);
  useEffect(() => {
    if (!doc || centered.current === projectId || size.w < 200) return;
    if (zoomToFit()) centered.current = projectId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, size, projectId]);

  // ---- scenes --------------------------------------------------------------
  const scenes = useMemo(() => {
    const out = new Map<string, Scene>();
    if (!doc) return out;
    for (const ab of doc.artboards) {
      const anim = mode === 'animate' && ab.id === activeArtboardId ? ab.animations.find((a) => a.id === animationId) : undefined;
      out.set(ab.id, buildScene(ab, anim ? sampleAnimation(ab, anim, frame) : new Map()));
    }
    return out;
  }, [doc, mode, activeArtboardId, animationId, frame]);

  const abPos = useCallback((ab: ArtboardDoc) => artboardPos(ab.artboard), []);

  // coordinate helpers
  const toStage = useCallback((cx: number, cy: number) => [(cx - view.panX) / view.zoom, (cy - view.panY) / view.zoom] as [number, number], [view]);
  const toScreen = useCallback((x: number, y: number) => [view.panX + x * view.zoom, view.panY + y * view.zoom] as [number, number], [view]);
  const clientPoint = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  const artboardAt = useCallback(
    (sx: number, sy: number): ArtboardDoc | undefined => {
      if (!doc) return undefined;
      // prefer the active artboard when overlapping
      const list = [...doc.artboards].sort((a, b) => (a.id === activeArtboardId ? -1 : b.id === activeArtboardId ? 1 : 0));
      return list.find((ab) => {
        const p = abPos(ab);
        return sx >= p.x && sy >= p.y && sx <= p.x + prop(ab.artboard, 'width') && sy <= p.y + prop(ab.artboard, 'height');
      });
    },
    [doc, activeArtboardId, abPos],
  );


  // ---- wheel zoom / pan --------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useEditor.getState();
      const v = s.view;
      const r = el.getBoundingClientRect();
      const cx = e.clientX - r.left;
      const cy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const zoom = Math.min(32, Math.max(0.02, v.zoom * factor));
        const k = zoom / v.zoom;
        s.set('view', { zoom, panX: cx - (cx - v.panX) * k, panY: cy - (cy - v.panY) * k });
      } else {
        s.set('view', { ...v, panX: v.panX - (e.shiftKey ? e.deltaY : e.deltaX), panY: v.panY - (e.shiftKey ? 0 : e.deltaY) });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- pen ---------------------------------------------------------------
  const finishPen = (closed: boolean) => {
    if (!pen) return;
    const s = useEditor.getState();
    if (pen.points.length >= 2) {
      s.commit((d) => {
        const ab = findArtboard(d, pen.abId);
        if (!ab) return;
        const o = pen.points[0];
        const objs = newPenShape(
          ab.artboard.id,
          o.x - prop(ab.artboard, 'originX') * prop(ab.artboard, 'width'),
          o.y - prop(ab.artboard, 'originY') * prop(ab.artboard, 'height'),
          pen.points.map((p) => ({ ...p, x: p.x - o.x, y: p.y - o.y })),
          closed,
        );
        insertObjects(ab, objs);
        useEditor.setState({ selection: [objs[0].id] });
      });
    }
    setPen(null);
  };

  // space to pan, escape/enter for pen
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      if (e.code === 'Space') {
        setSpaceDown(true);
        e.preventDefault();
      }
      if ((e.key === 'Enter' || e.key === 'Escape') && pen) {
        // handled here only; don't also trigger global shortcuts
        e.stopImmediatePropagation();
        e.preventDefault();
        finishPen(false);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up);
    };
  });

  // ---- selection geometry ----------------------------------------------
  const activeAb = doc ? findArtboard(doc, activeArtboardId) : undefined;
  const activeScene = activeAb ? scenes.get(activeAb.id) : undefined;

  /** Oriented box for a single object, or AABB for multi-selection, in stage space. */
  const selectionBox = useMemo(() => {
    if (!activeAb || !activeScene || !selection.length) return null;
    const p = abPos(activeAb);
    const ids = selection.filter((id) => activeScene.nodes.has(id));
    if (!ids.length) return null;
    if (ids.length === 1 && ids[0] !== activeAb.artboard.id) {
      const node = activeScene.nodes.get(ids[0])!;
      if (!isA(node.obj.type, 'Node')) return null;
      const world = node.world;
      const box = objectBounds(activeScene, ids[0], invert(world));
      if (isEmpty(box)) return null;
      const corners = [
        [box.minX, box.minY],
        [box.maxX, box.minY],
        [box.maxX, box.maxY],
        [box.minX, box.maxY],
      ].map(([x, y]) => {
        const [ax, ay] = apply(world, x, y);
        return [ax + p.x, ay + p.y] as [number, number];
      });
      const [ox, oy] = apply(world, 0, 0);
      return { corners, single: node.obj, origin: [ox + p.x, oy + p.y] as [number, number] };
    }
    const b = emptyBounds();
    for (const id of ids) {
      const ob = objectBounds(activeScene, id);
      if (!isEmpty(ob)) {
        addPoint(b, ob.minX, ob.minY);
        addPoint(b, ob.maxX, ob.maxY);
      }
    }
    if (isEmpty(b)) return null;
    const corners: [number, number][] = [
      [b.minX + p.x, b.minY + p.y],
      [b.maxX + p.x, b.minY + p.y],
      [b.maxX + p.x, b.maxY + p.y],
      [b.minX + p.x, b.maxY + p.y],
    ];
    const isArtboard = ids.length === 1 && ids[0] === activeAb.artboard.id;
    return { corners, single: isArtboard ? activeAb.artboard : null, origin: null };
  }, [activeAb, activeScene, selection, abPos]);

  const handlePoints = (corners: [number, number][]): [Handle, [number, number]][] => {
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return [
      ['nw', corners[0]],
      ['ne', corners[1]],
      ['se', corners[2]],
      ['sw', corners[3]],
      ['n', mid(corners[0], corners[1])],
      ['e', mid(corners[1], corners[2])],
      ['s', mid(corners[2], corners[3])],
      ['w', mid(corners[3], corners[0])],
    ];
  };

  // ---- pointer handling ---------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (!doc) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const [cx, cy] = clientPoint(e);
    const [sx, sy] = toStage(cx, cy);
    const s = useEditor.getState();

    if (e.button === 1 || tool === 'hand' || spaceDown) {
      setDrag({ kind: 'pan', sx: cx, sy: cy, panX: view.panX, panY: view.panY });
      return;
    }
    if (e.button !== 0) return;

    if (previewing) {
      const ab = activeAb;
      if (ab) {
        const p = abPos(ab);
        engine.current?.pointer('down', sx - p.x, sy - p.y);
      }
      return;
    }
    if (readOnly) {
      const ab = artboardAt(sx, sy);
      if (ab) s.setActiveArtboard(ab.id);
      return;
    }

    // creation tools
    if (tool === 'artboard') {
      setDrag({ kind: 'create', tool: 'artboard', abId: null, x0: sx, y0: sy, x1: sx, y1: sy });
      return;
    }
    if (tool === 'rectangle' || tool === 'ellipse' || tool === 'triangle' || tool === 'polygon' || tool === 'star') {
      const ab = artboardAt(sx, sy) ?? activeAb;
      if (!ab) return;
      s.setActiveArtboard(ab.id);
      setDrag({ kind: 'create', tool, abId: ab.id, x0: sx, y0: sy, x1: sx, y1: sy });
      return;
    }
    if (tool === 'text') {
      const ab = artboardAt(sx, sy) ?? activeAb;
      if (!ab) return;
      s.setActiveArtboard(ab.id);
      createText(ab.id, sx, sy);
      s.set('tool', 'select');
      return;
    }
    if (tool === 'pen') {
      const ab = pen ? findArtboard(doc, pen.abId) : artboardAt(sx, sy) ?? activeAb;
      if (!ab) return;
      const p = abPos(ab);
      const lx = sx - p.x;
      const ly = sy - p.y;
      if (pen && pen.points.length > 1) {
        const f = pen.points[0];
        if (Math.hypot(f.x - lx, f.y - ly) * view.zoom < 8) {
          finishPen(true);
          return;
        }
      }
      s.setActiveArtboard(ab.id);
      const next = { abId: ab.id, points: [...(pen?.points ?? []), { x: lx, y: ly }], cursor: null };
      setPen(next);
      setDrag({ kind: 'penHandle', index: next.points.length - 1 });
      return;
    }

    // vertex editing
    if (editPathId && activeAb && activeScene) {
      const hit = (e.target as Element).closest('[data-vertex]') as HTMLElement | null;
      if (hit) {
        const id = hit.dataset.vertex!;
        const which = hit.dataset.which as 'pt' | 'in' | 'out';
        const pathNode = activeScene.nodes.get(editPathId);
        if (pathNode) {
          s.beginGesture();
          setDrag({ kind: 'vertex', abId: activeAb.id, id, which, inv: invert(pathNode.world) });
          return;
        }
      }
    }

    // handles
    const handleEl = (e.target as Element).closest('[data-handle]') as HTMLElement | null;
    if (handleEl && activeAb && activeScene && selectionBox?.single) {
      const handle = handleEl.dataset.handle as Handle | 'rotate';
      const target = selectionBox.single;
      if (target.type === 'Artboard') {
        if (handle === 'rotate') return;
        s.beginGesture();
        setDrag({
          kind: 'resizeArtboard',
          abId: activeAb.id,
          handle,
          x: artboardPos(target).x,
          y: artboardPos(target).y,
          w: prop(target, 'width'),
          h: prop(target, 'height'),
          sx,
          sy,
        });
        return;
      }
      const node = activeScene.nodes.get(target.id)!;
      const p = abPos(activeAb);
      if (handle === 'rotate') {
        const [ox, oy] = apply(node.world, 0, 0);
        s.beginGesture();
        setDrag({
          kind: 'rotate',
          abId: activeAb.id,
          id: target.id,
          cx: ox + p.x,
          cy: oy + p.y,
          a0: Math.atan2(sy - (oy + p.y), sx - (ox + p.x)),
          rot0: prop(target, 'rotation', activeScene.overrides),
        });
        return;
      }
      const box = objectBounds(activeScene, target.id, invert(node.world));
      let parametric: CoreObj | null = null;
      if (target.type === 'Shape') {
        const paths = pathsOfShape(activeScene, target.id);
        const only = paths.length === 1 ? paths[0] : null;
        if (
          only &&
          isA(only.type, 'ParametricPath') &&
          parentIdOf(activeAb, only) === target.id &&
          !prop(only, 'x', activeScene.overrides) &&
          !prop(only, 'y', activeScene.overrides) &&
          !prop(only, 'rotation', activeScene.overrides) &&
          prop(only, 'scaleX', activeScene.overrides) === 1 &&
          prop(only, 'scaleY', activeScene.overrides) === 1
        ) {
          parametric = only;
        }
      } else if (isA(target.type, 'ParametricPath') || target.type === 'Text') {
        parametric = target;
      }
      s.beginGesture();
      if (target.type === 'Text') {
        // resizing text switches it to a fixed-size box
        const w = box.maxX - box.minX;
        const h = box.maxY - box.minY;
        s.commit((d) => {
          const t = findObj(findArtboard(d, activeAb.id)!, target.id);
          if (t) Object.assign(t.props, { sizingValue: 2, width: w, height: h });
        });
      }
      setDrag({
        kind: 'resize',
        abId: activeAb.id,
        id: target.id,
        handle,
        localInv: invert(node.world),
        box,
        startLocal: node.world,
        x: prop(target, 'x', activeScene.overrides),
        y: prop(target, 'y', activeScene.overrides),
        sx: prop(target, 'scaleX', activeScene.overrides),
        sy: prop(target, 'scaleY', activeScene.overrides),
        rot: prop(target, 'rotation', activeScene.overrides),
        parametric,
        pw: parametric ? (parametric.type === 'Text' ? box.maxX - box.minX : prop(parametric, 'width', activeScene.overrides)) : 0,
        ph: parametric ? (parametric.type === 'Text' ? box.maxY - box.minY : prop(parametric, 'height', activeScene.overrides)) : 0,
      });
      return;
    }

    // artboard title click
    const titleEl = (e.target as Element).closest('[data-artboard-title]') as HTMLElement | null;
    if (titleEl) {
      const id = titleEl.dataset.artboardTitle!;
      s.setActiveArtboard(id);
      s.select([id]);
      beginArtboardMove([id], sx, sy);
      return;
    }

    // select / move
    const ab = artboardAt(sx, sy);
    if (!ab) {
      s.select([]);
      setDrag({ kind: 'marquee', abId: activeArtboardId ?? '', x0: sx, y0: sy, x1: sx, y1: sy, additive: e.shiftKey });
      return;
    }
    if (ab.id !== activeArtboardId) s.setActiveArtboard(ab.id);
    const scene = scenes.get(ab.id)!;
    const p = abPos(ab);
    const rawHit = hitTestShape(scene, sx - p.x, sy - p.y, 4 / view.zoom);
    if (rawHit) {
      let hit = rawHit;
      const doubleClick = e.detail >= 2;
      // clicking outside the entered group leaves it
      const context = s.selectionContext && ancestorChain(ab, rawHit).includes(s.selectionContext) ? s.selectionContext : null;
      if (context !== s.selectionContext) s.set('selectionContext', context);
      if (doubleClick && selectMode === 'group') {
        // double click steps one level into the group under the cursor; doing it
        // again on a nested group steps in further
        const chain = ancestorChain(ab, rawHit);
        const floor = context ? chain.indexOf(context) + 1 : 0;
        if (chain.length > floor + 1 && isEnterable(ab, chain[floor]!)) {
          s.set('selectionContext', chain[floor]!);
          s.select([chain[floor + 1]!]);
          beginMove(ab, scene, [chain[floor + 1]!], sx, sy);
          return;
        }
      }
      hit = resolveSelectable(ab, hit, { selection: s.selection, drill: doubleClick, mode: selectMode, context });
      if (doubleClick && findObj(ab, hit)?.type === 'Text') {
        s.select([hit]);
        s.set('editTextId', hit);
        return;
      }
      if (doubleClick) {
        const o = findObj(ab, hit);
        const paths = o?.type === 'Shape' ? pathsOfShape(scene, hit) : [];
        const pts = paths.find((pp) => pp.type === 'PointsPath');
        if (pts) {
          s.select([hit]);
          s.set('editPathId', pts.id);
          return;
        }
      }
      let sel = s.selection;
      if (e.shiftKey) {
        s.select([hit], true);
        sel = useEditor.getState().selection;
      } else if (!sel.includes(hit)) {
        s.select([hit]);
        sel = [hit];
      }
      beginMove(ab, scene, sel, sx, sy);
    } else {
      if (!e.shiftKey) {
        s.select([]);
        s.set('selectionContext', null);
      }
      setDrag({ kind: 'marquee', abId: ab.id, x0: sx, y0: sy, x1: sx, y1: sy, additive: e.shiftKey });
    }
  };

  const beginArtboardMove = (ids: string[], sx: number, sy: number) => {
    const d = useEditor.getState().doc!;
    const start = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
      const ab = findArtboard(d, id);
      if (ab) start.set(id, artboardPos(ab.artboard));
    }
    useEditor.getState().beginGesture();
    setDrag({ kind: 'moveArtboard', ids, sx, sy, start });
  };

  const beginMove = (ab: ArtboardDoc, scene: Scene, ids: string[], sx: number, sy: number) => {
    // move only top-most selected nodes
    const nodes = ids.filter((id) => {
      const o = findObj(ab, id);
      return o && isA(o.type, 'Node') && o.type !== 'Artboard' && !ids.some((other) => other !== id && isAncestor(ab, other, id));
    });
    if (ids.includes(ab.artboard.id)) {
      beginArtboardMove([ab.id], sx, sy);
      return;
    }
    const start = new Map<string, { x: number; y: number; inv: Mat }>();
    for (const id of nodes) {
      const n = scene.nodes.get(id)!;
      const parentWorld = n.parent ? scene.nodes.get(n.parent)!.world : ([1, 0, 0, 1, 0, 0] as Mat);
      start.set(id, { x: prop(n.obj, 'x', scene.overrides), y: prop(n.obj, 'y', scene.overrides), inv: invert(parentWorld) });
    }
    useEditor.getState().beginGesture();
    setDrag({ kind: 'move', abId: ab.id, sx, sy, start, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const [cx, cy] = clientPoint(e);
    const [sx, sy] = toStage(cx, cy);
    const s = useEditor.getState();
    if (previewing && activeAb) {
      const p = abPos(activeAb);
      engine.current?.pointer('move', sx - p.x, sy - p.y);
    }
    if (!drag) {
      if (tool === 'pen' && pen) {
        const ab = findArtboard(doc!, pen.abId);
        if (ab) {
          const p = abPos(ab);
          setPen({ ...pen, cursor: [sx - p.x, sy - p.y] });
        }
      }
      if (tool === 'select' && !previewing && doc) {
        const ab = artboardAt(sx, sy);
        let hit: string | null = null;
        if (ab) {
          const p = abPos(ab);
          hit = hitTestShape(scenes.get(ab.id)!, sx - p.x, sy - p.y, 4 / view.zoom);
          if (hit) {
            hit = resolveSelectable(ab, hit, { selection: s.selection, drill: false, mode: selectMode, context: s.selectionContext });
          }
        }
        if (hit !== s.hoverId) s.set('hoverId', hit);
      }
      return;
    }
    switch (drag.kind) {
      case 'pan':
        s.set('view', { ...view, panX: drag.panX + cx - drag.sx, panY: drag.panY + cy - drag.sy });
        break;
      case 'marquee':
      case 'create':
        setDrag({ ...drag, x1: sx, y1: sy });
        break;
      case 'penHandle': {
        if (!pen) break;
        const ab = findArtboard(doc!, pen.abId)!;
        const p = abPos(ab);
        const pt = pen.points[drag.index];
        const ox = sx - p.x - pt.x;
        const oy = sy - p.y - pt.y;
        if (Math.hypot(ox, oy) < 2) break;
        const pts = [...pen.points];
        pts[drag.index] = { x: pt.x, y: pt.y, outX: ox, outY: oy, inX: -ox, inY: -oy };
        setPen({ ...pen, points: pts });
        break;
      }
      case 'moveArtboard': {
        const dx = sx - drag.sx;
        const dy = sy - drag.sy;
        s.commit((d) => {
          for (const id of drag.ids) {
            const ab = findArtboard(d, id);
            const st = drag.start.get(id);
            if (ab && st) {
              setArtboardPos(ab.artboard, Math.round(st.x + dx), Math.round(st.y + dy));
            }
          }
        });
        break;
      }
      case 'move': {
        let dx = sx - drag.sx;
        let dy = sy - drag.sy;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (!drag.moved && Math.hypot(dx, dy) * view.zoom < 3) break;
        if (!drag.moved) setDrag({ ...drag, moved: true });
        for (const [id, st] of drag.start) {
          const ldx = st.inv[0] * dx + st.inv[2] * dy;
          const ldy = st.inv[1] * dx + st.inv[3] * dy;
          const snap = getPrefs().snapToPixel ? Math.round : round2;
          s.setProps(id, { x: snap(st.x + ldx), y: snap(st.y + ldy) });
        }
        break;
      }
      case 'rotate': {
        let a = drag.rot0 + Math.atan2(sy - drag.cy, sx - drag.cx) - drag.a0;
        if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        s.setProps(drag.id, { rotation: a });
        break;
      }
      case 'resize': {
        const ab = findArtboard(doc!, drag.abId)!;
        const p = abPos(ab);
        const [lx, ly] = apply(drag.localInv, sx - p.x, sy - p.y);
        const b = drag.box;
        const h = drag.handle;
        const bw = b.maxX - b.minX || 1;
        const bh = b.maxY - b.minY || 1;
        let minX = b.minX, maxX = b.maxX, minY = b.minY, maxY = b.maxY;
        if (h.includes('e')) maxX = lx;
        if (h.includes('w')) minX = lx;
        if (h.includes('s')) maxY = ly;
        if (h.includes('n')) minY = ly;
        let kx = (maxX - minX) / bw;
        let ky = (maxY - minY) / bh;
        if (e.shiftKey) {
          // keep aspect ratio
          const k = h.length === 2 ? Math.max(Math.abs(kx), Math.abs(ky)) : h === 'n' || h === 's' ? Math.abs(ky) : Math.abs(kx);
          kx = Math.sign(kx || 1) * k;
          ky = Math.sign(ky || 1) * k;
          if (h.includes('w')) minX = maxX - bw * kx;
          else if (!h.includes('e')) minX = (b.minX + b.maxX) / 2 - (bw * kx) / 2;
          if (h.includes('n')) minY = maxY - bh * ky;
          else if (!h.includes('s')) minY = (b.minY + b.maxY) / 2 - (bh * ky) / 2;
        }
        // a local point p maps to p*k + shift; keep the fixed edges in place
        const shiftX = minX - b.minX * kx;
        const shiftY = minY - b.minY * ky;
        // local -> parent linear part = rotation * scale
        const c = Math.cos(drag.rot);
        const sn = Math.sin(drag.rot);
        const px = c * drag.sx * shiftX - sn * drag.sy * shiftY;
        const py = sn * drag.sx * shiftX + c * drag.sy * shiftY;
        if (drag.parametric) {
          const size = { width: round2(Math.abs(drag.pw * kx)), height: round2(Math.abs(drag.ph * ky)) };
          if (drag.parametric.id !== drag.id) {
            s.setProps(drag.parametric.id, size);
            s.setProps(drag.id, { x: round2(drag.x + px), y: round2(drag.y + py) });
          } else {
            s.setProps(drag.id, { ...size, x: round2(drag.x + px), y: round2(drag.y + py) });
          }
        } else {
          s.setProps(drag.id, {
            scaleX: round4(drag.sx * kx),
            scaleY: round4(drag.sy * ky),
            x: round2(drag.x + px),
            y: round2(drag.y + py),
          });
        }
        break;
      }
      case 'resizeArtboard': {
        const dx = sx - drag.sx;
        const dy = sy - drag.sy;
        const h = drag.handle;
        let { x, y, w, h: hh } = drag;
        if (h.includes('e')) w = drag.w + dx;
        if (h.includes('s')) hh = drag.h + dy;
        if (h.includes('w')) {
          w = drag.w - dx;
          x = drag.x + dx;
        }
        if (h.includes('n')) {
          hh = drag.h - dy;
          y = drag.y + dy;
        }
        w = Math.max(1, Math.round(w));
        hh = Math.max(1, Math.round(hh));
        s.commit((d) => {
          const ab = findArtboard(d, drag.abId)!;
          Object.assign(ab.artboard.props, { width: w, height: hh });
          setArtboardPos(ab.artboard, Math.round(x), Math.round(y));
        });
        break;
      }
      case 'vertex': {
        const ab = findArtboard(doc!, drag.abId)!;
        const p = abPos(ab);
        const [lx, ly] = apply(drag.inv, sx - p.x, sy - p.y);
        const v = findObj(ab, drag.id);
        if (!v) break;
        if (drag.which === 'pt') {
          s.setProps(drag.id, { x: round2(lx), y: round2(ly) });
        } else {
          const vx = prop(v, 'x');
          const vy = prop(v, 'y');
          const ang = Math.atan2(ly - vy, lx - vx);
          const dist = Math.hypot(lx - vx, ly - vy);
          if (v.type === 'CubicMirroredVertex') {
            s.setProps(drag.id, { rotation: drag.which === 'out' ? ang : ang + Math.PI, distance: dist });
          } else if (v.type === 'CubicAsymmetricVertex') {
            s.setProps(drag.id, drag.which === 'out' ? { rotation: ang, outDistance: dist } : { rotation: ang + Math.PI, inDistance: dist });
          } else if (v.type === 'CubicDetachedVertex') {
            s.setProps(drag.id, drag.which === 'out' ? { outRotation: ang, outDistance: dist } : { inRotation: ang, inDistance: dist });
          }
        }
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = useEditor.getState();
    const [cx, cy] = clientPoint(e);
    const [sx, sy] = toStage(cx, cy);
    if (previewing && activeAb) {
      const p = abPos(activeAb);
      engine.current?.pointer('up', sx - p.x, sy - p.y);
    }
    if (!drag) return;
    if (drag.kind === 'marquee' && doc) {
      const ab = findArtboard(doc, drag.abId);
      const scene = ab && scenes.get(ab.id);
      if (ab && scene && Math.abs(drag.x1 - drag.x0) * view.zoom > 3) {
        const p = abPos(ab);
        const minX = Math.min(drag.x0, drag.x1) - p.x, maxX = Math.max(drag.x0, drag.x1) - p.x;
        const minY = Math.min(drag.y0, drag.y1) - p.y, maxY = Math.max(drag.y0, drag.y1) - p.y;
        const ids: string[] = [];
        for (const o of ab.objects) {
          if (parentIdOf(ab, o) !== ab.artboard.id || !isA(o.type, 'Node')) continue;
          const b = objectBounds(scene, o.id);
          if (!isEmpty(b) && b.minX < maxX && b.maxX > minX && b.minY < maxY && b.maxY > minY) ids.push(o.id);
        }
        s.select(drag.additive ? [...new Set([...s.selection, ...ids])] : ids);
      }
    } else if (drag.kind === 'create' && doc) {
      let x0 = Math.min(drag.x0, drag.x1), x1 = Math.max(drag.x0, drag.x1);
      let y0 = Math.min(drag.y0, drag.y1), y1 = Math.max(drag.y0, drag.y1);
      if (e.shiftKey) {
        const m = Math.max(x1 - x0, y1 - y0);
        x1 = drag.x1 >= drag.x0 ? x0 + m : x1;
        x0 = drag.x1 >= drag.x0 ? x0 : x1 - m;
        y1 = drag.y1 >= drag.y0 ? y0 + m : y1;
        y0 = drag.y1 >= drag.y0 ? y0 : y1 - m;
      }
      let w = x1 - x0;
      let h = y1 - y0;
      if (w * view.zoom < 4 && h * view.zoom < 4) {
        // click without drag: default size
        w = drag.tool === 'artboard' ? 500 : 100;
        h = w;
        x0 = drag.x0 - (drag.tool === 'artboard' ? 0 : w / 2);
        y0 = drag.y0 - (drag.tool === 'artboard' ? 0 : h / 2);
      }
      if (drag.tool === 'artboard') {
        s.commit((d) => {
          const ab = newArtboard(`Artboard ${d.artboards.length + 1}`, Math.round(x0), Math.round(y0), Math.round(w), Math.round(h));
          d.artboards.push(ab);
          setTimeout(() => {
            useEditor.getState().setActiveArtboard(ab.id);
            useEditor.getState().select([ab.id]);
          });
        });
      } else if (drag.abId) {
        const kind = drag.tool;
        s.commit((d) => {
          const ab = findArtboard(d, drag.abId!)!;
          const p = abPos(ab);
          const scene = buildScene(ab);
          // parent: selected group if it's a plain Node, else artboard
          const sel = s.selection.length === 1 ? findObj(ab, s.selection[0]) : undefined;
          const parent = sel && sel.type === 'Node' ? sel : ab.artboard;
          const inv = invert(scene.nodes.get(parent.id)!.world);
          const [lx, ly] = apply(inv, x0 + w / 2 - p.x, y0 + h / 2 - p.y);
          const prefs = getPrefs();
          const fill = prefs.shapeFillMode === 'fixed' ? prefs.shapeFill : nextColor();
          const objs = newParametricShape(kind, parent.id, round2(lx), round2(ly), round2(w), round2(h), fill);
          if (prefs.shapeStroke) objs.push(...solidStroke(objs[0].id, prefs.strokeColor, prefs.strokeWidth));
          insertObjects(ab, objs);
          setTimeout(() => useEditor.getState().select([objs[0].id]));
        });
      }
      s.set('tool', 'select');
    } else if (drag.kind === 'move' && !drag.moved && !e.shiftKey && doc) {
      // click on already-selected item within a multi-selection: select just it
      const ab = findArtboard(doc, drag.abId);
      if (ab) {
        const p = abPos(ab);
        const hit = hitTestShape(scenes.get(ab.id)!, sx - p.x, sy - p.y, 4 / view.zoom);
        if (hit && s.selection.length > 1) {
          s.select([resolveSelectable(ab, hit, { selection: [], drill: false, mode: selectMode, context: s.selectionContext })]);
        }
      }
    }
    if (drag.kind !== 'pan' && drag.kind !== 'marquee' && drag.kind !== 'create' && drag.kind !== 'penHandle') s.endGesture();
    setDrag(null);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!doc || previewing) return;
    const [cx, cy] = clientPoint(e);
    const [sx, sy] = toStage(cx, cy);
    const s = useEditor.getState();
    const titleEl = (e.target as Element).closest('[data-artboard-title]') as HTMLElement | null;
    if (titleEl) {
      s.setActiveArtboard(titleEl.dataset.artboardTitle!);
      s.select([titleEl.dataset.artboardTitle!]);
      openContextMenu(e, objectMenu());
      return;
    }
    const ab = artboardAt(sx, sy);
    if (ab) {
      if (ab.id !== activeArtboardId) s.setActiveArtboard(ab.id);
      const p = abPos(ab);
      let hit = hitTestShape(scenes.get(ab.id)!, sx - p.x, sy - p.y, 4 / view.zoom);
      if (hit) {
        hit = resolveSelectable(ab, hit, { selection: s.selection, drill: false, mode: selectMode, context: s.selectionContext });
        if (!s.selection.includes(hit)) s.select([hit]);
        openContextMenu(e, objectMenu());
        return;
      }
    }
    if (s.selection.length && !ab) s.select([]);
    openContextMenu(e, canvasMenu());
  };

  const createText = async (abId: string, sx: number, sy: number) => {
    const s = useEditor.getState();
    let font: { name: string; bytes: Uint8Array };
    try {
      font = await loadBundledFont();
    } catch {
      return;
    }
    const prefs = getPrefs();
    let id = '';
    s.commit((d) => {
      const ab = findArtboard(d, abId)!;
      const scene = buildScene(ab);
      const sel = s.selection.length === 1 ? findObj(ab, s.selection[0]) : undefined;
      const parent = sel && sel.type === 'Node' ? sel : ab.artboard;
      const p = artboardPos(ab.artboard);
      const [lx, ly] = apply(invert(scene.nodes.get(parent.id)!.world), sx - p.x, sy - p.y);
      const fontAssetId = ensureFontAsset(d, font.name, font.bytes);
      const objs = newTextObjects({
        parentId: parent.id,
        x: round2(lx),
        y: round2(ly - prefs.textSize * 0.6),
        text: 'Text',
        fontAssetId,
        fontSize: prefs.textSize,
        color: prefs.textColor,
      });
      insertObjects(ab, objs);
      id = objs[0].id;
    });
    if (id) {
      s.select([id]);
      s.set('editTextId', id);
    }
  };

  const zoomToSelection = () => {
    const s = useEditor.getState();
    if (!activeAb || !activeScene || !s.selection.length) return zoomToFit();
    const p = abPos(activeAb);
    const b = emptyBounds();
    for (const id of s.selection) {
      const ob = objectBounds(activeScene, id);
      if (!isEmpty(ob)) {
        addPoint(b, ob.minX + p.x, ob.minY + p.y);
        addPoint(b, ob.maxX + p.x, ob.maxY + p.y);
      }
    }
    if (isEmpty(b)) return;
    const w = Math.max(1, b.maxX - b.minX);
    const h = Math.max(1, b.maxY - b.minY);
    const zoom = Math.min(16, Math.max(0.05, Math.min((size.w - 160) / w, (size.h - 160) / h)));
    s.set('view', { zoom, panX: size.w / 2 - (b.minX + w / 2) * zoom, panY: size.h / 2 - (b.minY + h / 2) * zoom });
  };

  useEffect(() => {
    const onFit = () => zoomToFit();
    const onZoom = (e: Event) => {
      const type = (e as CustomEvent).detail as string;
      if (type === 'fit') zoomToFit();
      else if (type === 'in') zoomBy(1.25);
      else if (type === 'out') zoomBy(1 / 1.25);
      else if (type === '100') zoomBy(1 / useEditor.getState().view.zoom);
      else if (type === 'selection') zoomToSelection();
    };
    window.addEventListener('editor:fit', onFit);
    window.addEventListener('editor:zoom', onZoom);
    return () => {
      window.removeEventListener('editor:fit', onFit);
      window.removeEventListener('editor:zoom', onZoom);
    };
  });

  const onDoubleClick = () => {
    /* handled via e.detail in pointerdown */
  };

  // ---- rendering overlay ---------------------------------------------------
  if (!doc) return null;
  const cursor =
    tool === 'hand' || spaceDown
      ? drag?.kind === 'pan'
        ? 'grabbing'
        : 'grab'
      : tool === 'select'
        ? drag?.kind === 'resize' || drag?.kind === 'resizeArtboard'
          ? HANDLE_CURSORS[drag.handle]
          : 'default'
        : 'crosshair';

  const stroke = '#57a5e0';
  const overlay: React.ReactNode[] = [];

  // artboard titles + active outline
  for (const ab of doc.artboards) {
    const p = abPos(ab);
    const [tx, ty] = toScreen(p.x, p.y);
    const w = prop(ab.artboard, 'width') * view.zoom;
    const h = prop(ab.artboard, 'height') * view.zoom;
    const active = ab.id === activeArtboardId;
    overlay.push(
      <g key={`ab-${ab.id}`}>
        <text
          data-artboard-title={ab.id}
          x={tx}
          y={ty - 7}
          fill={active ? '#e8e8e8' : '#8a8a8a'}
          fontSize={11}
          style={{ cursor: 'default', userSelect: 'none' }}
        >
          {String(ab.artboard.props.name ?? 'Artboard')}
        </text>
        {active && <rect x={tx} y={ty} width={w} height={h} fill="none" stroke="#ffffff22" />}
      </g>,
    );
  }

  const pathOutline = (scene: Scene, ab: ArtboardDoc, id: string, color: string, key: string, widthPx = 1.5) => {
    const p = abPos(ab);
    const out: React.ReactNode[] = [];
    const o = scene.nodes.get(id)?.obj;
    if (!o) return out;
    const paths = o.type === 'Shape' ? pathsOfShape(scene, id) : isA(o.type, 'Path') ? [o] : [];
    for (const path of paths) {
      const g = pathGeometry(path, scene);
      const world = scene.nodes.get(path.id)!.world;
      const m = mul([view.zoom, 0, 0, view.zoom, view.panX + p.x * view.zoom, view.panY + p.y * view.zoom], world);
      out.push(
        <path
          key={`${key}-${path.id}`}
          d={g.d}
          transform={`matrix(${m.join(' ')})`}
          fill="none"
          stroke={color}
          strokeWidth={widthPx}
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
    return out;
  };

  if (!previewing && activeAb && activeScene) {
    if (hoverId && !selection.includes(hoverId)) overlay.push(...pathOutline(activeScene, activeAb, hoverId, stroke, 'hover', 1));
    for (const id of selection) {
      if (id !== activeAb.artboard.id) overlay.push(...pathOutline(activeScene, activeAb, id, stroke, 'sel', 1));
    }
    if (selectionBox && !editPathId) {
      const pts = selectionBox.corners.map(([x, y]) => toScreen(x, y));
      overlay.push(
        <polygon key="selbox" points={pts.map((q) => q.join(',')).join(' ')} fill="none" stroke={stroke} strokeWidth={1} />,
      );
      if (selectionBox.single && !readOnly) {
        const hs = handlePoints(selectionBox.corners);
        const rotatable = selectionBox.single.type !== 'Artboard';
        for (const [h, [x, y]] of hs) {
          const [px, py] = toScreen(x, y);
          if (rotatable && h.length === 2) {
            overlay.push(
              <circle
                key={`rot-${h}`}
                data-handle="rotate"
                cx={px}
                cy={py}
                r={14}
                fill="transparent"
                style={{ cursor: 'alias' }}
              />,
            );
          }
          overlay.push(
            <rect
              key={`h-${h}`}
              data-handle={h}
              x={px - 4}
              y={py - 4}
              width={8}
              height={8}
              fill="#fff"
              stroke={stroke}
              strokeWidth={1}
              style={{ cursor: HANDLE_CURSORS[h] }}
            />,
          );
        }
        if (selectionBox.origin) {
          const [ox, oy] = toScreen(...selectionBox.origin);
          overlay.push(
            <g key="origin" pointerEvents="none">
              <circle cx={ox} cy={oy} r={4} fill="none" stroke="#fff" strokeWidth={1.5} />
              <circle cx={ox} cy={oy} r={1.5} fill={stroke} />
            </g>,
          );
        }
      }
    }
    // vertex editing
    if (editPathId) {
      const pathNode = activeScene.nodes.get(editPathId);
      if (pathNode) {
        const p = abPos(activeAb);
        const toS = (x: number, y: number) => {
          const [ax, ay] = apply(pathNode.world, x, y);
          return toScreen(ax + p.x, ay + p.y);
        };
        overlay.push(...pathOutline(activeScene, activeAb, editPathId, '#ffcf33', 'edit', 1.5));
        for (const v of pathNode.children.filter((c) => isA(c.type, 'PathVertex'))) {
          const vc = vertexControls(v, activeScene.overrides);
          const [vx, vy] = toS(vc.x, vc.y);
          for (const which of ['in', 'out'] as const) {
            const cp = vc[which];
            if (!cp) continue;
            const [hx, hy] = toS(cp[0], cp[1]);
            overlay.push(
              <g key={`${v.id}-${which}`}>
                <line x1={vx} y1={vy} x2={hx} y2={hy} stroke="#ffcf33" strokeWidth={1} />
                <circle data-vertex={v.id} data-which={which} cx={hx} cy={hy} r={4} fill="#1a1a1a" stroke="#ffcf33" />
              </g>,
            );
          }
          overlay.push(
            <rect
              key={`${v.id}-pt`}
              data-vertex={v.id}
              data-which="pt"
              x={vx - 4}
              y={vy - 4}
              width={8}
              height={8}
              fill={selection.includes(v.id) ? '#ffcf33' : '#fff'}
              stroke="#ffcf33"
              style={{ cursor: 'move' }}
            />,
          );
        }
      }
    }
  }

  // drags
  if (drag?.kind === 'marquee' || (drag?.kind === 'create' && drag.tool === 'artboard')) {
    const [ax, ay] = toScreen(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1));
    overlay.push(
      <rect
        key="marq"
        x={ax}
        y={ay}
        width={Math.abs(drag.x1 - drag.x0) * view.zoom}
        height={Math.abs(drag.y1 - drag.y0) * view.zoom}
        fill="#57a5e022"
        stroke={stroke}
        strokeDasharray={drag.kind === 'marquee' ? '4 3' : undefined}
      />,
    );
  }
  if (drag?.kind === 'create' && drag.tool !== 'artboard') {
    const [ax, ay] = toScreen(Math.min(drag.x0, drag.x1), Math.min(drag.y0, drag.y1));
    const w = Math.abs(drag.x1 - drag.x0) * view.zoom;
    const h = Math.abs(drag.y1 - drag.y0) * view.zoom;
    overlay.push(
      drag.tool === 'ellipse' ? (
        <ellipse key="cr" cx={ax + w / 2} cy={ay + h / 2} rx={w / 2} ry={h / 2} fill="#c4c4c455" stroke={stroke} />
      ) : (
        <rect key="cr" x={ax} y={ay} width={w} height={h} fill="#c4c4c455" stroke={stroke} />
      ),
    );
  }
  if (pen && doc) {
    const ab = findArtboard(doc, pen.abId);
    if (ab) {
      const p = abPos(ab);
      const S = (x: number, y: number) => toScreen(x + p.x, y + p.y);
      let d = '';
      pen.points.forEach((pt, i) => {
        const [x, y] = S(pt.x, pt.y);
        if (i === 0) d += `M${x} ${y}`;
        else {
          const prev = pen.points[i - 1];
          const [c1x, c1y] = S(prev.x + (prev.outX ?? 0), prev.y + (prev.outY ?? 0));
          const [c2x, c2y] = S(pt.x + (pt.inX ?? 0), pt.y + (pt.inY ?? 0));
          d += `C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`;
        }
      });
      if (pen.cursor && pen.points.length) {
        const [x, y] = S(...pen.cursor);
        overlay.push(<path key="pen-next" d={`${d}L${x} ${y}`} fill="none" stroke={stroke} strokeDasharray="4 3" />);
      }
      overlay.push(<path key="pen" d={d} fill="none" stroke={stroke} strokeWidth={1.5} />);
      pen.points.forEach((pt, i) => {
        const [x, y] = S(pt.x, pt.y);
        if (pt.outX !== undefined) {
          const [ox, oy] = S(pt.x + pt.outX, pt.y + (pt.outY ?? 0));
          const [ix, iy] = S(pt.x + (pt.inX ?? 0), pt.y + (pt.inY ?? 0));
          overlay.push(<line key={`pl${i}`} x1={ix} y1={iy} x2={ox} y2={oy} stroke={stroke} />);
        }
        overlay.push(<rect key={`pp${i}`} x={x - 3.5} y={y - 3.5} width={7} height={7} fill={i === 0 ? stroke : '#fff'} stroke={stroke} />);
      });
    }
  }

  return (
    <div
      ref={wrapRef}
      className="relative flex-1 overflow-hidden select-none"
      style={{ background: 'var(--stage)', cursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (previewing && activeAb) engine.current?.pointer('exit', -1, -1);
        useEditor.getState().set('hoverId', null);
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragOver={(e) => {
        if (readOnly) return;
        if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/x-openrive-asset')) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const assetId = e.dataTransfer.getData('application/x-openrive-asset');
        if (assetId) placeAssetOnArtboard(assetId);
        else if (e.dataTransfer.files.length) importAssetFiles([...e.dataTransfer.files]);
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" style={{ width: size.w, height: size.h }} />
      <svg className="absolute inset-0" width={size.w} height={size.h}>
        {overlay}
      </svg>
      {engineError && (
        <div className="absolute left-3 bottom-3 right-3 px-3 py-2 rounded-md bg-[#3a1f1f] text-[#ffb4b4] text-[12px]">
          {engineError}
        </div>
      )}
      {previewing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-anim/90 text-white text-[11px] font-medium pointer-events-none">
          Previewing state machine: interact with the artboard
        </div>
      )}
      {pen && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-bg3 text-t1 text-[11px] pointer-events-none">
          Click to add points, drag for curves. Click the first point to close, Enter to finish.
        </div>
      )}
      {editTextId && activeAb && activeScene && (
        <InlineTextEditor ab={activeAb} scene={activeScene} textId={editTextId} toScreen={toScreen} zoom={view.zoom} />
      )}
      {selectionContext && !editPathId && activeAb && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-bg3 text-t1 text-[11px]">
          Inside <b className="text-t0">{String(findObj(activeAb, selectionContext)?.props.name ?? 'group')}</b>. Clicks select its contents.{' '}
          <button
            className="text-accent ml-1"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => useEditor.getState().set('selectionContext', null)}
          >
            Exit (Esc)
          </button>
        </div>
      )}
      {editPathId && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-bg3 text-t1 text-[11px]">
          Editing vertices. Drag points and handles.{' '}
          <button className="text-accent ml-1" onPointerDown={(e) => e.stopPropagation()} onClick={() => useEditor.getState().set('editPathId', null)}>
            Done
          </button>
        </div>
      )}
      <div className="absolute right-3 bottom-3 flex items-center gap-1 bg-bg2/90 rounded-md px-1 py-0.5 text-t1">
        <button
          className="icon-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoomBy(1 / 1.25)}
          title="Zoom out"
        >
          −
        </button>
        <button
          className="px-1 min-w-[46px] text-center"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={zoomToFit}
          title="Zoom to fit (Shift+1)"
        >
          {Math.round(view.zoom * 100)}%
        </button>
        <button className="icon-btn" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoomBy(1.25)} title="Zoom in">
          +
        </button>
      </div>
    </div>
  );

  function zoomBy(k: number) {
    const s = useEditor.getState();
    const v = s.view;
    const cx = size.w / 2;
    const cy = size.h / 2;
    const zoom = Math.min(32, Math.max(0.02, v.zoom * k));
    const f = zoom / v.zoom;
    s.set('view', { zoom, panX: cx - (cx - v.panX) * f, panY: cy - (cy - v.panY) * f });
  }
}

/**
 * Rive-style selection: clicking selects the top-level object under the
 * artboard (or inside the currently selected group); double click drills in.
 */
/** Ancestors of an object, outermost first, ending with the object itself. */
function ancestorChain(ab: ArtboardDoc, id: string): string[] {
  const chain: string[] = [];
  let cur: string | null = id;
  while (cur && cur !== ab.artboard.id) {
    chain.unshift(cur);
    const o = findObj(ab, cur);
    cur = o ? parentIdOf(ab, o) : null;
  }
  return chain;
}

export interface SelectOptions {
  selection: string[];
  /** double click: go one level deeper */
  drill: boolean;
  /** 'group' picks the outermost group, 'object' picks what is under the cursor */
  mode: 'group' | 'object';
  /** group the user entered: selection starts one level inside it */
  context: string | null;
}

/**
 * Decides what a click selects. In group mode a click picks the outermost group,
 * and double-clicking enters it so the next click picks inside. In object mode a
 * click picks the shape itself, whatever it is nested in.
 */
function resolveSelectable(ab: ArtboardDoc, hitId: string, o: SelectOptions): string {
  const chain = ancestorChain(ab, hitId);
  if (!chain.length) return hitId;
  if (o.mode === 'object') return hitId;

  // inside an entered group, treat its children as the top level
  const contextIndex = o.context ? chain.indexOf(o.context) : -1;
  const floor = contextIndex >= 0 ? contextIndex + 1 : 0;

  for (let i = chain.length - 1; i >= floor; i--) {
    if (o.selection.includes(chain[i]!)) {
      // clicking inside a selected group: keep it, or drill one level deeper on double click
      return o.drill && i + 1 < chain.length ? chain[i + 1]! : chain[i]!;
    }
  }
  // if a sibling inside a group is selected, stay at that depth
  for (const sel of o.selection) {
    const selected = findObj(ab, sel);
    const parent = selected ? parentIdOf(ab, selected) : null;
    const idx = parent ? chain.indexOf(parent) : -1;
    if (idx >= floor - 1 && idx + 1 < chain.length && idx >= 0) return chain[idx + 1]!;
  }
  const pick = chain[Math.min(floor, chain.length - 1)]!;
  return o.drill && floor + 1 < chain.length ? chain[floor + 1]! : pick;
}

/** True when the object can be entered (a group with children). */
function isEnterable(ab: ArtboardDoc, id: string): boolean {
  const o = findObj(ab, id);
  if (!o || !isA(o.type, 'Node') || o.type === 'Shape' || o.type === 'Text') return false;
  return ab.objects.some((c) => parentIdOf(ab, c) === id);
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

const PALETTE = [0xff57a5e0, 0xfff25ca2, 0xffffcf33, 0xff27c498, 0xffff7a2b, 0xffb45cff, 0xffc4c4c4];
let colorIndex = 0;
function nextColor() {
  return PALETTE[colorIndex++ % PALETTE.length];
}

/** Textarea over a Text object for editing its content in place. */
function InlineTextEditor({
  ab,
  scene,
  textId,
  toScreen,
  zoom,
}: {
  ab: ArtboardDoc;
  scene: Scene;
  textId: string;
  toScreen: (x: number, y: number) => [number, number];
  zoom: number;
}) {
  const t = ab.objects.find((o) => o.id === textId);
  const [value, setValue] = useState(() => (t ? textRuns(ab, t.id).map((r) => String(r.props.text ?? '')).join('') : ''));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    useEditor.getState().beginGesture();
    ref.current?.focus();
    ref.current?.select();
    return () => useEditor.getState().endGesture();
  }, []);
  if (!t) return null;
  const node = scene.nodes.get(t.id);
  if (!node) return null;
  const box = textBox(ab, t, scene.overrides);
  const p = artboardPos(ab.artboard);
  const [ax, ay] = apply(node.world, box.x, box.y);
  const [sx, sy] = toScreen(ax + p.x, ay + p.y);
  const scale = Math.hypot(node.world[0], node.world[1]) * zoom;
  const style = textStyles(ab, t.id)[0];
  const fontSize = (style ? prop(style, 'fontSize') : 32) * scale;
  const update = (v: string) => {
    setValue(v);
    useEditor.getState().commit((d) => {
      const a = findArtboard(d, ab.id)!;
      const rs = textRuns(a, textId);
      if (!rs.length) return;
      rs[0].props.text = v;
      // editing as plain text merges styled runs into the first one
      if (rs.length > 1) a.objects = a.objects.filter((o) => !rs.slice(1).includes(o));
    });
  };
  const close = () => useEditor.getState().set('editTextId', null);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => update(e.target.value)}
      onBlur={close}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) close();
      }}
      spellCheck={false}
      className="absolute bg-[#57a5e01a] outline outline-1 outline-accent text-transparent caret-white resize-none overflow-hidden"
      style={{
        left: sx,
        top: sy,
        width: Math.max(40, box.w * scale + 24),
        height: Math.max(fontSize * 1.3, box.h * scale + fontSize * 0.4),
        fontSize,
        lineHeight: 1.21,
        fontFamily: 'Inter, sans-serif',
        padding: 0,
        transformOrigin: 'top left',
        transform: `rotate(${Math.atan2(node.world[1], node.world[0])}rad)`,
      }}
    />
  );
}
