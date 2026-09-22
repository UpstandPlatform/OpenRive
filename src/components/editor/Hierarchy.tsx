'use client';
import { useEffect, useMemo, useState } from 'react';
import { openContextMenu } from './ContextMenu';
import { objectMenu } from './menus';
import {
  ChevronDown,
  ChevronRight,
  Circle,
  Eye,
  EyeOff,
  Folder,
  Frame,
  Hexagon,
  Image as ImageIcon,
  Lock,
  Unlock,
  Spline,
  Square,
  Star,
  Triangle,
  Type,
  Bone,
  Box,
} from 'lucide-react';
import { ArtboardDoc, CoreObj } from '@/lib/rive/document';
import { childrenOf, findArtboard, findObj, isAncestor, moveBefore, parentIdOf, reparent } from '@/lib/rive/ops';
import { isA } from '@/lib/rive/schema';
import { prop } from '@/lib/rive/scene';
import { useEditor } from '@/lib/store/editor';

export function iconFor(o: CoreObj, size = 13) {
  const t = o.type;
  if (t === 'Artboard') return <Frame size={size} />;
  if (t === 'Rectangle') return <Square size={size} />;
  if (t === 'Ellipse') return <Circle size={size} />;
  if (t === 'Triangle') return <Triangle size={size} />;
  if (t === 'Polygon') return <Hexagon size={size} />;
  if (t === 'Star') return <Star size={size} />;
  if (t === 'PointsPath') return <Spline size={size} />;
  if (t === 'Node') return <Folder size={size} />;
  if (t === 'Image') return <ImageIcon size={size} />;
  if (t === 'Text') return <Type size={size} />;
  if (isA(t, 'Bone')) return <Bone size={size} />;
  if (t === 'Shape') return <Box size={size} />;
  return <Box size={size} />;
}

export function displayName(o: CoreObj): string {
  const n = o.props.name;
  if (typeof n === 'string' && n) return n;
  return o.type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function visibleInTree(o: CoreObj) {
  return isA(o.type, 'TransformComponent') && o.type !== 'Artboard';
}

type DropPos = 'before' | 'after' | 'inside';

export function Hierarchy() {
  const doc = useEditor((s) => s.doc);
  const activeArtboardId = useEditor((s) => s.activeArtboardId);
  const selection = useEditor((s) => s.selection);
  const readOnly = useEditor((s) => s.readOnly);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);

  useEffect(() => {
    const onRename = () => {
      const sel = useEditor.getState().selection;
      if (sel.length === 1) setRenaming(sel[0]);
    };
    window.addEventListener('editor:rename-selected', onRename);
    return () => window.removeEventListener('editor:rename-selected', onRename);
  }, []);

  const rows = useMemo(() => {
    const out: { o: CoreObj; depth: number; ab: ArtboardDoc; hasKids: boolean }[] = [];
    if (!doc) return out;
    for (const ab of doc.artboards) {
      const kids = childrenOf(ab, ab.artboard.id).filter(visibleInTree);
      out.push({ o: ab.artboard, depth: 0, ab, hasKids: kids.length > 0 });
      if (collapsed.has(ab.artboard.id)) continue;
      const walk = (id: string, depth: number) => {
        for (const c of childrenOf(ab, id).filter(visibleInTree)) {
          const sub = childrenOf(ab, c.id).filter(visibleInTree);
          out.push({ o: c, depth, ab, hasKids: sub.length > 0 });
          if (!collapsed.has(c.id)) walk(c.id, depth + 1);
        }
      };
      walk(ab.artboard.id, 1);
    }
    return out;
  }, [doc, collapsed]);

  if (!doc) return null;
  const s = useEditor.getState();

  const toggle = (id: string) => {
    const n = new Set(collapsed);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setCollapsed(n);
  };

  const onSelect = (e: React.MouseEvent, ab: ArtboardDoc, o: CoreObj) => {
    if (ab.id !== activeArtboardId) s.setActiveArtboard(ab.id);
    if (e.shiftKey && selection.length && ab.id === activeArtboardId) {
      // range select among visible rows
      const ids = rows.filter((r) => r.ab.id === ab.id).map((r) => r.o.id);
      const a = ids.indexOf(selection[selection.length - 1]);
      const b = ids.indexOf(o.id);
      if (a >= 0 && b >= 0) {
        s.select(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    s.select([o.id], e.ctrlKey || e.metaKey);
  };

  const onDrop = () => {
    if (!dragId || !drop || dragId === drop.id) return;
    const { id, pos } = drop;
    s.commit((d) => {
      for (const ab of d.artboards) {
        const moving = findObj(ab, dragId);
        const target = findObj(ab, id);
        if (!moving || !target || moving.type === 'Artboard') continue;
        if (isAncestor(ab, dragId, id)) return;
        if (pos === 'inside') {
          const first = childrenOf(ab, target.id).find(visibleInTree);
          reparent(ab, dragId, target.id, first?.id ?? null);
        } else {
          const parent = parentIdOf(ab, target) ?? ab.artboard.id;
          const siblings = childrenOf(ab, parent).filter((c) => c.id !== dragId);
          const idx = siblings.findIndex((c) => c.id === id);
          const before = pos === 'before' ? id : siblings.slice(idx + 1).find(visibleInTree)?.id ?? null;
          if (parentIdOf(ab, moving) === parent) moveBefore(ab, dragId, before, parent);
          else reparent(ab, dragId, parent, before);
        }
      }
    });
    setDrop(null);
    setDragId(null);
  };

  const toggleHidden = (ab: ArtboardDoc, o: CoreObj) => {
    s.commit((d) => {
      const a = findArtboard(d, ab.id);
      const t = a && findObj(a, o.id);
      if (t) t.props.drawableFlags = (prop(t, 'drawableFlags') as number) ^ 1;
    });
  };

  return (
    <div className="flex-1 overflow-auto py-1" onDragEnd={() => (setDrop(null), setDragId(null))}>
      {rows.map(({ o, depth, ab, hasKids }) => {
        const selected = selection.includes(o.id);
        const isArtboard = o.type === 'Artboard';
        const hidden = isA(o.type, 'Drawable') && !isArtboard && (prop(o, 'drawableFlags') & 1) === 1;
        const locked = isA(o.type, 'Drawable') && (prop(o, 'drawableFlags') & 2) === 2;
        const dropHere = drop?.id === o.id;
        return (
          <div
            key={o.id}
            draggable={!isArtboard && !readOnly && renaming !== o.id}
            onDragStart={(e) => {
              setDragId(o.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === o.id) return;
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const f = (e.clientY - r.top) / r.height;
              const canNest = isArtboard || o.type === 'Node' || o.type === 'Shape' || isA(o.type, 'Bone');
              const pos: DropPos = isArtboard ? 'inside' : f < 0.3 ? 'before' : f > 0.7 || !canNest ? 'after' : 'inside';
              if (drop?.id !== o.id || drop.pos !== pos) setDrop({ id: o.id, pos });
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop();
            }}
            onClick={(e) => onSelect(e, ab, o)}
            onContextMenu={(e) => {
              const st = useEditor.getState();
              if (ab.id !== st.activeArtboardId) st.setActiveArtboard(ab.id);
              if (!st.selection.includes(o.id)) st.select([o.id]);
              openContextMenu(e, objectMenu());
            }}
            onDoubleClick={() => !readOnly && setRenaming(o.id)}
            className={`group relative flex items-center h-7 pr-2 cursor-default ${
              selected ? 'bg-[#2a4a66]' : ab.id === activeArtboardId && isArtboard ? 'bg-bg2' : 'hover:bg-bg2'
            } ${hidden ? 'opacity-50' : ''}`}
            style={{ paddingLeft: 6 + depth * 14 }}
          >
            {dropHere && drop.pos === 'before' && <div className="absolute left-0 right-0 top-0 h-0.5 bg-accent" />}
            {dropHere && drop.pos === 'after' && <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-accent" />}
            {dropHere && drop.pos === 'inside' && <div className="absolute inset-0 border border-accent rounded pointer-events-none" />}
            <button
              className={`w-4 h-4 flex items-center justify-center text-t2 ${hasKids ? '' : 'invisible'}`}
              onClick={(e) => {
                e.stopPropagation();
                toggle(o.id);
              }}
            >
              {collapsed.has(o.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            </button>
            <span className={`mx-1.5 ${isArtboard ? 'text-t0' : 'text-t1'}`}>{iconFor(o)}</span>
            {renaming === o.id ? (
              <input
                autoFocus
                className="field h-5"
                defaultValue={displayName(o)}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  setRenaming(null);
                  if (name) {
                    s.commit((d) => {
                      const a = findArtboard(d, ab.id);
                      const t = a && findObj(a, o.id);
                      if (t) t.props.name = name;
                    });
                  }
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span className={`truncate flex-1 ${isArtboard ? 'font-medium' : ''}`}>{displayName(o)}</span>
            )}
            {!isArtboard && isA(o.type, 'Drawable') && !readOnly && (
              <button
                className={`ml-1 text-t2 hover:text-t0 ${locked ? '' : 'invisible group-hover:visible'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  s.commit((d) => {
                    const a = findArtboard(d, ab.id);
                    const t = a && findObj(a, o.id);
                    if (t) t.props.drawableFlags = (prop(t, 'drawableFlags') as number) ^ 2;
                  });
                }}
                title={locked ? 'Unlock' : 'Lock so it can not be selected on the stage'}
              >
                {locked ? <Lock size={11} /> : <Unlock size={11} />}
              </button>
            )}
            {!isArtboard && isA(o.type, 'Drawable') && !readOnly && (
              <button
                className={`ml-1 text-t2 hover:text-t0 ${hidden ? '' : 'invisible group-hover:visible'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleHidden(ab, o);
                }}
                title={hidden ? 'Show' : 'Hide'}
              >
                {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
