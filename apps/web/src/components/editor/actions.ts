'use client';
// Every editor command in one place. Keyboard shortcuts, context menus, the
// menu bar and the shortcuts dialog all read from this registry, and users can
// rebind any shortcut (stored in preferences).
import { ArtboardDoc, CoreObj } from '@openrive/rive/document';
import {
  ClipboardData,
  copyObjects,
  deleteObjects,
  duplicateObjects,
  findArtboard,
  findObj,
  groupObjects,
  isAncestor,
  parentIdOf,
  pasteObjects,
  removeKeyframes,
  reorder,
  ungroup,
  allKeyframes,
} from '@openrive/rive/ops';
import { artboardPos, buildScene, invert, isEmpty, objectBounds, pathsOfShape, prop, sampleAnimation, setArtboardPos } from '@openrive/rive/scene';
import { isA } from '@openrive/rive/schema';
import { getPrefs } from '@/lib/client/prefs';
import { animationFrames, getActive, Tool, useEditor } from '@/lib/store/editor';
import { deleteSmSelection } from './StateMachinePanel';

export type ActionCategory = 'File' | 'Edit' | 'Object' | 'Arrange' | 'Tools' | 'View' | 'Animate';

export interface Action {
  id: string;
  label: string;
  category: ActionCategory;
  keys: string[];
  /** only active in this mode */
  when?: 'design' | 'animate';
  /** changes the document (disabled for read-only files) */
  edits?: boolean;
  run(): void;
  enabled?(): boolean;
}

/** Callbacks owned by the Editor component (saving etc.) */
export const editorHandlers: {
  save?: () => void;
  exportFile?: () => void;
  openShortcuts?: () => void;
  openPrefs?: () => void;
  preview?: () => void;
} = {};

// ---------------------------------------------------------------------------
// helpers

const st = () => useEditor.getState();
const hasSelection = () => st().selection.length > 0;
const selectedObjects = (): CoreObj[] => {
  const { ab } = getActive();
  if (!ab) return [];
  return st()
    .selection.map((id) => findObj(ab, id))
    .filter((o): o is CoreObj => !!o && o.type !== 'Artboard');
};
const selectedNodes = () => selectedObjects().filter((o) => isA(o.type, 'Node'));
const topLevel = (ab: ArtboardDoc, ids: string[]) => ids.filter((id) => !ids.some((o) => o !== id && isAncestor(ab, o, id)));

function editArtboard(fn: (ab: ArtboardDoc) => void) {
  const { ab } = getActive();
  if (!ab) return;
  st().commit((d) => {
    const a = findArtboard(d, ab.id);
    if (a) fn(a);
  });
}

// ---------------------------------------------------------------------------
// clipboard

const CLIP_KEY = 'openrive:clipboard';
let memoryClip: ClipboardData | null = null;

function writeClip(c: ClipboardData) {
  memoryClip = c;
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(c, (_k, v) => (v instanceof Uint8Array ? { $bytes: Array.from(v) } : v)));
  } catch {
    /* too large or unavailable: keep the in-memory copy */
  }
}
function readClip(): ClipboardData | null {
  try {
    const raw = localStorage.getItem(CLIP_KEY);
    if (raw)
      return JSON.parse(raw, (_k, v) =>
        v && typeof v === 'object' && Array.isArray(v.$bytes) && Object.keys(v).length === 1 ? new Uint8Array(v.$bytes) : v,
      );
  } catch {
    /* fall through */
  }
  return memoryClip;
}
export const hasClipboard = () => !!readClip();

function copy(): boolean {
  const s = st();
  const { ab } = getActive();
  if (!ab || !s.doc) return false;
  const clip = copyObjects(s.doc, ab, s.selection);
  if (!clip) return false;
  writeClip(clip);
  return true;
}

function paste(inPlace: boolean) {
  const clip = readClip();
  const s = st();
  const { ab } = getActive();
  if (!clip || !ab) return;
  // paste into a selected group, next to a selected object, or onto the artboard
  const sel = s.selection.length === 1 ? findObj(ab, s.selection[0]) : undefined;
  let parentId = ab.artboard.id;
  if (sel && sel.type === 'Node') parentId = sel.id;
  else if (sel && sel.type !== 'Artboard') parentId = parentIdOf(ab, sel) ?? ab.artboard.id;
  let created: string[] = [];
  s.commit((d) => {
    created = pasteObjects(d, findArtboard(d, ab.id)!, clip, parentId, inPlace ? 0 : 10);
  });
  s.select(created);
}

// ---------------------------------------------------------------------------
// commands

export function deleteSelection() {
  const s = st();
  const { ab, anim } = getActive();
  if (!ab) return;
  if (s.mode === 'animate' && s.selectedKeyframes.length && anim && !s.stateMachineId) {
    const ids = new Set(s.selectedKeyframes);
    editArtboard((a) => removeKeyframes(a, a.animations.find((x) => x.id === anim.id)!, ids));
    s.set('selectedKeyframes', []);
    return;
  }
  if (s.mode === 'animate' && s.stateMachineId && s.smSelection) {
    deleteSmSelection();
    return;
  }
  if (s.editPathId) {
    const verts = s.selection.filter((id) => isA(findObj(ab, id)?.type ?? '', 'Vertex'));
    if (verts.length) {
      editArtboard((a) => deleteObjects(a, verts));
      s.select([s.editPathId]);
      return;
    }
  }
  const ids = s.selection.filter((id) => id !== ab.artboard.id);
  if (ids.length) {
    editArtboard((a) => deleteObjects(a, ids));
    s.select([]);
  } else if (s.selection.includes(ab.artboard.id) && s.doc && s.doc.artboards.length > 1) {
    s.commit((d) => {
      d.artboards = d.artboards.filter((a) => a.id !== ab.id);
    });
    s.setActiveArtboard(useEditor.getState().doc!.artboards[0].id);
    s.select([]);
  }
}

function duplicate() {
  const s = st();
  const { ab } = getActive();
  if (!ab || !s.selection.length) return;
  let created: string[] = [];
  editArtboard((a) => {
    created = duplicateObjects(
      a,
      s.selection.filter((id) => id !== ab.artboard.id),
    );
    for (const id of created) {
      const o = findObj(a, id);
      if (o && isA(o.type, 'Node')) {
        o.props.x = prop(o, 'x') + 10;
        o.props.y = prop(o, 'y') + 10;
      }
    }
  });
  if (created.length) s.select(created);
}

function group() {
  const s = st();
  let g: string | null = null;
  editArtboard((a) => {
    g = groupObjects(a, s.selection);
  });
  if (g) s.select([g]);
}

function ungroupSelection() {
  const groups = selectedObjects().filter((o) => o.type === 'Node');
  if (!groups.length) return;
  let kids: string[] = [];
  editArtboard((a) => {
    for (const g of groups) kids = kids.concat(ungroup(a, g.id));
  });
  st().select(kids);
}

function arrange(how: 'forward' | 'backward' | 'front' | 'back') {
  const { ab } = getActive();
  if (!ab) return;
  const ids = topLevel(ab, st().selection);
  // keep relative order: process from the side we're moving towards
  const ordered = how === 'front' || how === 'backward' ? [...ids].reverse() : ids;
  editArtboard((a) => {
    for (const id of ordered) reorder(a, id, how);
  });
}

function toggleFlag(bit: number) {
  const objs = selectedObjects().filter((o) => isA(o.type, 'Drawable'));
  if (!objs.length) return;
  const allSet = objs.every((o) => (prop(o, 'drawableFlags') & bit) === bit);
  editArtboard((a) => {
    for (const o of objs) {
      const t = findObj(a, o.id)!;
      const f = prop(t, 'drawableFlags');
      t.props.drawableFlags = allSet ? f & ~bit : f | bit;
    }
  });
}

function flip(axis: 'scaleX' | 'scaleY') {
  const s = st();
  const { ab, anim } = getActive();
  if (!ab) return;
  const ov = s.mode === 'animate' ? sampleAnimation(ab, anim, s.frame) : undefined;
  s.beginGesture();
  for (const o of selectedNodes()) s.setProps(o.id, { [axis]: -prop(o, axis, ov) });
  s.endGesture();
}

function nudge(dx: number, dy: number) {
  const s = st();
  const { ab, anim } = getActive();
  if (!ab || !s.selection.length) return;
  const ov = s.mode === 'animate' ? sampleAnimation(ab, anim, s.frame) : undefined;
  s.beginGesture();
  for (const id of s.selection) {
    const o = findObj(ab, id);
    if (!o) continue;
    if (o.type === 'Artboard') {
      s.commit((d) => {
        const a = findArtboard(d, ab.id)!;
        const p = artboardPos(a.artboard);
        setArtboardPos(a.artboard, p.x + dx, p.y + dy);
      });
    } else if (isA(o.type, 'Node') || isA(o.type, 'Vertex')) {
      s.setProps(id, { x: prop(o, 'x', ov) + dx, y: prop(o, 'y', ov) + dy });
    }
  }
  s.endGesture();
}

export function alignSelection(how: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
  const s = st();
  const { ab } = getActive();
  if (!ab) return;
  const scene = buildScene(ab);
  const ids = topLevel(ab, s.selection).filter((id) => id !== ab.artboard.id);
  const boxes = ids.map((id) => ({ id, b: objectBounds(scene, id) })).filter((x) => !isEmpty(x.b));
  if (!boxes.length) return;
  // a single object aligns to the artboard
  const ref =
    boxes.length === 1
      ? { minX: 0, minY: 0, maxX: prop(ab.artboard, 'width'), maxY: prop(ab.artboard, 'height') }
      : {
          minX: Math.min(...boxes.map((x) => x.b.minX)),
          maxX: Math.max(...boxes.map((x) => x.b.maxX)),
          minY: Math.min(...boxes.map((x) => x.b.minY)),
          maxY: Math.max(...boxes.map((x) => x.b.maxY)),
        };
  s.beginGesture();
  for (const { id, b } of boxes) {
    let dx = 0;
    let dy = 0;
    if (how === 'left') dx = ref.minX - b.minX;
    if (how === 'right') dx = ref.maxX - b.maxX;
    if (how === 'hcenter') dx = (ref.minX + ref.maxX) / 2 - (b.minX + b.maxX) / 2;
    if (how === 'top') dy = ref.minY - b.minY;
    if (how === 'bottom') dy = ref.maxY - b.maxY;
    if (how === 'vcenter') dy = (ref.minY + ref.maxY) / 2 - (b.minY + b.maxY) / 2;
    const n = scene.nodes.get(id)!;
    if (!isA(n.obj.type, 'Node')) continue;
    const pinv = invert(n.parent ? scene.nodes.get(n.parent)!.world : [1, 0, 0, 1, 0, 0]);
    s.setProps(id, { x: prop(n.obj, 'x') + pinv[0] * dx + pinv[2] * dy, y: prop(n.obj, 'y') + pinv[1] * dx + pinv[3] * dy });
  }
  s.endGesture();
}

function enterSelection() {
  const s = st();
  const { ab } = getActive();
  const o = selectedObjects()[0];
  if (!ab || !o || s.selection.length !== 1) return;
  if (o.type === 'Text') {
    s.set('editTextId', o.id);
    return;
  }
  if (o.type === 'Shape') {
    const pts = pathsOfShape(buildScene(ab), o.id).find((p) => p.type === 'PointsPath');
    if (pts) {
      s.set('editPathId', pts.id);
      return;
    }
  }
  const kids = ab.objects.filter((c) => c.props.parentId === o.id && isA(c.type, 'Node'));
  if (kids.length) s.select(kids.map((k) => k.id));
}

function selectParent() {
  const { ab } = getActive();
  if (!ab) return;
  const parents = new Set<string>();
  for (const o of selectedObjects()) {
    const p = parentIdOf(ab, o);
    if (p && p !== ab.artboard.id) parents.add(p);
  }
  if (parents.size) st().select([...parents]);
}

function keySelection() {
  const s = st();
  const { ab, anim } = getActive();
  if (!ab || !anim || s.mode !== 'animate') return;
  const ov = sampleAnimation(ab, anim, s.frame);
  s.beginGesture();
  for (const o of selectedNodes()) {
    s.setProps(o.id, {
      x: prop(o, 'x', ov),
      y: prop(o, 'y', ov),
      rotation: prop(o, 'rotation', ov),
      scaleX: prop(o, 'scaleX', ov),
      scaleY: prop(o, 'scaleY', ov),
    });
  }
  s.endGesture();
}

function stepFrame(delta: number) {
  const s = st();
  const { anim } = getActive();
  s.set('playing', false);
  const max = anim ? animationFrames(anim).duration : Infinity;
  s.setFrame(Math.min(max, Math.max(0, Math.round(s.frame) + delta)));
}

function jumpKey(dir: 1 | -1) {
  const s = st();
  const { anim } = getActive();
  if (!anim) return;
  const sel = new Set(s.selection);
  const frames = [
    ...new Set(
      allKeyframes(anim)
        .filter(({ ko }) => !sel.size || sel.has(ko.props.objectId as string))
        .map(({ kf }) => prop(kf, 'frame')),
    ),
  ].sort((a, b) => a - b);
  const cur = Math.round(s.frame);
  const next = dir > 0 ? frames.find((f) => f > cur) : [...frames].reverse().find((f) => f < cur);
  if (next !== undefined) {
    s.set('playing', false);
    s.setFrame(next);
  }
}

const tool = (t: Tool) => () => st().set('tool', t);
const zoom = (type: string) => () => window.dispatchEvent(new CustomEvent('editor:zoom', { detail: type }));

// ---------------------------------------------------------------------------
// registry

export const ACTIONS: Action[] = [
  // File
  { id: 'file.save', label: 'Save', category: 'File', keys: ['Ctrl+S'], run: () => editorHandlers.save?.() },
  { id: 'file.export', label: 'Export .riv', category: 'File', keys: ['Ctrl+E'], run: () => editorHandlers.exportFile?.() },
  { id: 'file.preview', label: 'Open preview', category: 'File', keys: ['Ctrl+P'], run: () => editorHandlers.preview?.() },
  { id: 'file.shortcuts', label: 'Keyboard shortcuts', category: 'File', keys: ['Shift+/', 'Ctrl+/'], run: () => editorHandlers.openShortcuts?.() },
  { id: 'file.prefs', label: 'Preferences', category: 'File', keys: ['Ctrl+,'], run: () => editorHandlers.openPrefs?.() },

  // Edit
  { id: 'edit.undo', label: 'Undo', category: 'Edit', keys: ['Ctrl+Z'], edits: true, run: () => st().undo(), enabled: () => st().past.length > 0 },
  { id: 'edit.redo', label: 'Redo', category: 'Edit', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'], edits: true, run: () => st().redo(), enabled: () => st().future.length > 0 },
  { id: 'edit.cut', label: 'Cut', category: 'Edit', keys: ['Ctrl+X'], edits: true, when: 'design', run: () => copy() && deleteSelection(), enabled: hasSelection },
  { id: 'edit.copy', label: 'Copy', category: 'Edit', keys: ['Ctrl+C'], when: 'design', run: () => void copy(), enabled: hasSelection },
  { id: 'edit.paste', label: 'Paste', category: 'Edit', keys: ['Ctrl+V'], edits: true, when: 'design', run: () => paste(false), enabled: hasClipboard },
  { id: 'edit.pasteInPlace', label: 'Paste in place', category: 'Edit', keys: ['Ctrl+Shift+V'], edits: true, when: 'design', run: () => paste(true), enabled: hasClipboard },
  { id: 'edit.duplicate', label: 'Duplicate', category: 'Edit', keys: ['Ctrl+D'], edits: true, run: duplicate, enabled: hasSelection },
  {
    id: 'edit.delete',
    label: 'Delete',
    category: 'Edit',
    keys: ['Delete', 'Backspace'],
    edits: true,
    run: deleteSelection,
    enabled: () => hasSelection() || st().selectedKeyframes.length > 0 || !!st().smSelection,
  },
  {
    id: 'edit.selectAll',
    label: 'Select all',
    category: 'Edit',
    keys: ['Ctrl+A'],
    run: () => {
      const { ab } = getActive();
      if (ab) st().select(ab.objects.filter((o) => o.props.parentId === ab.artboard.id && isA(o.type, 'Node')).map((o) => o.id));
    },
  },
  {
    id: 'edit.deselect',
    label: 'Deselect / exit',
    category: 'Edit',
    keys: ['Escape'],
    run: () => {
      const s = st();
      if (s.editTextId) s.set('editTextId', null);
      else if (s.editPathId) s.set('editPathId', null);
      else if (s.previewing) s.set('previewing', false);
      else s.select([]);
      s.set('tool', 'select');
    },
  },
  { id: 'edit.rename', label: 'Rename', category: 'Edit', keys: ['F2'], edits: true, run: () => window.dispatchEvent(new Event('editor:rename-selected')), enabled: () => st().selection.length === 1 },

  // Object
  { id: 'object.group', label: 'Group selection', category: 'Object', keys: ['Ctrl+G'], edits: true, run: group, enabled: hasSelection },
  { id: 'object.ungroup', label: 'Ungroup', category: 'Object', keys: ['Ctrl+Shift+G'], edits: true, run: ungroupSelection, enabled: () => selectedObjects().some((o) => o.type === 'Node') },
  { id: 'object.enter', label: 'Enter group / edit path or text', category: 'Object', keys: ['Enter'], when: 'design', run: enterSelection, enabled: () => st().selection.length === 1 },
  { id: 'object.selectParent', label: 'Select parent', category: 'Object', keys: ['Shift+Enter'], run: selectParent, enabled: hasSelection },
  { id: 'object.hide', label: 'Show / hide', category: 'Object', keys: ['Ctrl+Shift+H'], edits: true, run: () => toggleFlag(1), enabled: hasSelection },
  { id: 'object.lock', label: 'Lock / unlock', category: 'Object', keys: ['Ctrl+Shift+L'], edits: true, run: () => toggleFlag(2), enabled: hasSelection },
  { id: 'object.flipH', label: 'Flip horizontal', category: 'Object', keys: ['Shift+H'], edits: true, run: () => flip('scaleX'), enabled: hasSelection },
  { id: 'object.flipV', label: 'Flip vertical', category: 'Object', keys: ['Shift+V'], edits: true, run: () => flip('scaleY'), enabled: hasSelection },
  ...(
    [
      ['left', 'ArrowLeft', -1, 0],
      ['right', 'ArrowRight', 1, 0],
      ['up', 'ArrowUp', 0, -1],
      ['down', 'ArrowDown', 0, 1],
    ] as const
  ).flatMap(([name, key, dx, dy]): Action[] => [
    { id: `object.nudge.${name}`, label: `Nudge ${name}`, category: 'Object', keys: [key], edits: true, run: () => nudge(dx * getPrefs().nudge, dy * getPrefs().nudge), enabled: hasSelection },
    {
      id: `object.nudgeBig.${name}`,
      label: `Nudge ${name} (large)`,
      category: 'Object',
      keys: [`Shift+${key}`],
      edits: true,
      run: () => nudge(dx * getPrefs().bigNudge, dy * getPrefs().bigNudge),
      enabled: hasSelection,
    },
  ]),

  // Arrange
  { id: 'arrange.front', label: 'Bring to front', category: 'Arrange', keys: ['Ctrl+Shift+]'], edits: true, run: () => arrange('front'), enabled: hasSelection },
  { id: 'arrange.forward', label: 'Bring forward', category: 'Arrange', keys: ['Ctrl+]'], edits: true, run: () => arrange('forward'), enabled: hasSelection },
  { id: 'arrange.backward', label: 'Send backward', category: 'Arrange', keys: ['Ctrl+['], edits: true, run: () => arrange('backward'), enabled: hasSelection },
  { id: 'arrange.back', label: 'Send to back', category: 'Arrange', keys: ['Ctrl+Shift+['], edits: true, run: () => arrange('back'), enabled: hasSelection },
  { id: 'arrange.alignLeft', label: 'Align left', category: 'Arrange', keys: ['Alt+A'], edits: true, run: () => alignSelection('left'), enabled: hasSelection },
  { id: 'arrange.alignHCenter', label: 'Align horizontal centers', category: 'Arrange', keys: ['Alt+H'], edits: true, run: () => alignSelection('hcenter'), enabled: hasSelection },
  { id: 'arrange.alignRight', label: 'Align right', category: 'Arrange', keys: ['Alt+D'], edits: true, run: () => alignSelection('right'), enabled: hasSelection },
  { id: 'arrange.alignTop', label: 'Align top', category: 'Arrange', keys: ['Alt+W'], edits: true, run: () => alignSelection('top'), enabled: hasSelection },
  { id: 'arrange.alignVCenter', label: 'Align vertical centers', category: 'Arrange', keys: ['Alt+V'], edits: true, run: () => alignSelection('vcenter'), enabled: hasSelection },
  { id: 'arrange.alignBottom', label: 'Align bottom', category: 'Arrange', keys: ['Alt+S'], edits: true, run: () => alignSelection('bottom'), enabled: hasSelection },

  // Tools
  { id: 'tool.select', label: 'Select tool', category: 'Tools', keys: ['V'], run: tool('select') },
  { id: 'tool.artboard', label: 'Artboard tool', category: 'Tools', keys: ['A'], edits: true, run: tool('artboard') },
  { id: 'tool.rectangle', label: 'Rectangle tool', category: 'Tools', keys: ['R'], edits: true, run: tool('rectangle') },
  { id: 'tool.ellipse', label: 'Ellipse tool', category: 'Tools', keys: ['O'], edits: true, run: tool('ellipse') },
  { id: 'tool.triangle', label: 'Triangle tool', category: 'Tools', keys: ['Y'], edits: true, run: tool('triangle') },
  { id: 'tool.polygon', label: 'Polygon tool', category: 'Tools', keys: ['Shift+R'], edits: true, run: tool('polygon') },
  { id: 'tool.star', label: 'Star tool', category: 'Tools', keys: ['Shift+O'], edits: true, run: tool('star') },
  { id: 'tool.text', label: 'Text tool', category: 'Tools', keys: ['T'], edits: true, run: tool('text') },
  { id: 'tool.pen', label: 'Pen tool', category: 'Tools', keys: ['P'], edits: true, run: tool('pen') },
  { id: 'tool.hand', label: 'Hand tool (or hold Space)', category: 'Tools', keys: ['H'], run: tool('hand') },

  // View
  { id: 'view.zoomIn', label: 'Zoom in', category: 'View', keys: ['Ctrl+=', '='], run: zoom('in') },
  { id: 'view.zoomOut', label: 'Zoom out', category: 'View', keys: ['Ctrl+-', '-'], run: zoom('out') },
  { id: 'view.zoom100', label: 'Zoom to 100%', category: 'View', keys: ['Shift+0'], run: zoom('100') },
  { id: 'view.zoomFit', label: 'Zoom to fit artboard', category: 'View', keys: ['Shift+1'], run: zoom('fit') },
  { id: 'view.zoomSelection', label: 'Zoom to selection', category: 'View', keys: ['Shift+2'], run: zoom('selection'), enabled: hasSelection },
  { id: 'view.toggleMode', label: 'Toggle Design / Animate', category: 'View', keys: ['Tab'], run: () => st().setMode(st().mode === 'design' ? 'animate' : 'design') },
  {
    id: 'view.themePanel',
    label: 'Cycle layers / theme / assets panel',
    category: 'View',
    keys: ['Alt+T'],
    run: () => st().set('leftTab', st().leftTab === 'layers' ? 'theme' : st().leftTab === 'theme' ? 'assets' : 'layers'),
  },
  { id: 'view.codePanel', label: 'Toggle code panel', category: 'View', keys: ['Alt+C'], run: () => st().set('codeOpen', !st().codeOpen) },

  // Animate
  { id: 'anim.play', label: 'Play / pause', category: 'Animate', keys: ['Enter', 'Shift+Space'], when: 'animate', run: () => st().set('playing', !st().playing) },
  { id: 'anim.key', label: 'Key selected transforms', category: 'Animate', keys: ['K'], when: 'animate', edits: true, run: keySelection, enabled: hasSelection },
  { id: 'anim.prevFrame', label: 'Previous frame', category: 'Animate', keys: [','], when: 'animate', run: () => stepFrame(-1) },
  { id: 'anim.nextFrame', label: 'Next frame', category: 'Animate', keys: ['.'], when: 'animate', run: () => stepFrame(1) },
  { id: 'anim.prevFrame10', label: 'Back 10 frames', category: 'Animate', keys: ['Shift+,'], when: 'animate', run: () => stepFrame(-10) },
  { id: 'anim.nextFrame10', label: 'Forward 10 frames', category: 'Animate', keys: ['Shift+.'], when: 'animate', run: () => stepFrame(10) },
  { id: 'anim.prevKey', label: 'Previous keyframe', category: 'Animate', keys: ['Alt+,'], when: 'animate', run: () => jumpKey(-1) },
  { id: 'anim.nextKey', label: 'Next keyframe', category: 'Animate', keys: ['Alt+.'], when: 'animate', run: () => jumpKey(1) },
  { id: 'anim.start', label: 'Go to start', category: 'Animate', keys: ['Home'], when: 'animate', run: () => (st().set('playing', false), st().setFrame(0)) },
  {
    id: 'anim.end',
    label: 'Go to end',
    category: 'Animate',
    keys: ['End'],
    when: 'animate',
    run: () => {
      const { anim } = getActive();
      st().set('playing', false);
      if (anim) st().setFrame(animationFrames(anim).duration);
    },
  },
  {
    id: 'anim.preview',
    label: 'Preview state machine',
    category: 'Animate',
    keys: ['Ctrl+Enter'],
    when: 'animate',
    run: () => st().set('previewing', !st().previewing),
    enabled: () => !!st().stateMachineId,
  },
];

export const ACTION_MAP = new Map(ACTIONS.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// key handling

const CODE_KEYS: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Equal: '=',
  Minus: '-',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
  Space: 'Space',
  NumpadAdd: '=',
  NumpadSubtract: '-',
};

/** Normalizes a keyboard event to a combo like "Ctrl+Shift+Z" (Ctrl also means ⌘ on macOS). */
export function comboFromEvent(e: KeyboardEvent | React.KeyboardEvent): string | null {
  let key: string;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = e.code.slice(6);
  else if (CODE_KEYS[e.code]) key = CODE_KEYS[e.code];
  else key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function bindingsFor(a: Action): string[] {
  return getPrefs().shortcuts[a.id] ?? a.keys;
}

export function isEnabled(a: Action): boolean {
  const s = st();
  if (a.edits && s.readOnly) return false;
  if (a.when && a.when !== s.mode) return false;
  return a.enabled ? a.enabled() : true;
}

export function runAction(id: string) {
  const a = ACTION_MAP.get(id);
  if (a && isEnabled(a)) a.run();
}

/** Finds and runs the action bound to a key event. Returns true if handled. */
export function handleKey(e: KeyboardEvent): boolean {
  const combo = comboFromEvent(e);
  if (!combo) return false;
  const mode = st().mode;
  const candidates = ACTIONS.filter((a) => bindingsFor(a).includes(combo) && (!a.when || a.when === mode));
  const a = candidates.find(isEnabled) ?? candidates[0];
  if (!a) return false;
  e.preventDefault();
  if (isEnabled(a)) a.run();
  return true;
}

/** Pretty label for a combo on this platform. */
export function formatCombo(combo: string): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return combo
    .split('+')
    .map((p) =>
      p === 'Ctrl'
        ? mac
          ? '⌘'
          : 'Ctrl'
        : p === 'Alt'
          ? mac
            ? '⌥'
            : 'Alt'
          : p === 'Shift'
            ? mac
              ? '⇧'
              : 'Shift'
            : p.replace('Arrow', '').replace('Backspace', '⌫').replace('Delete', 'Del').replace('Escape', 'Esc'),
    )
    .join(mac ? '' : '+');
}

export function shortcutLabel(id: string): string | undefined {
  const a = ACTION_MAP.get(id);
  const k = a && bindingsFor(a)[0];
  return k ? formatCombo(k) : undefined;
}
