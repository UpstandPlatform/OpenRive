'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Circle,
  ChevronDown,
  Download,
  Frame,
  Hand,
  Hexagon,
  Menu,
  MousePointer2,
  PenTool,
  Redo2,
  Save,
  Square,
  Star,
  Triangle,
  Undo2,
  FolderPlus,
  Type,
  Play,
  Settings,
  Keyboard,
  Braces,
} from 'lucide-react';
import { runAction } from './actions';
import { Tool, useEditor } from '@/lib/store/editor';
import { useCurrentUser } from '@/lib/client/session';
import { Avatar } from '../Avatar';
import { AppIcon } from '../AppHeader';

const SHAPE_TOOLS: { tool: Tool; label: string; key: string; icon: React.ReactNode }[] = [
  { tool: 'rectangle', label: 'Rectangle', key: 'R', icon: <Square size={15} /> },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle size={15} /> },
  { tool: 'triangle', label: 'Triangle', key: '', icon: <Triangle size={15} /> },
  { tool: 'polygon', label: 'Polygon', key: '', icon: <Hexagon size={15} /> },
  { tool: 'star', label: 'Star', key: '', icon: <Star size={15} /> },
];

export function TopBar({ onSave, onExport, saveState }: { onSave: () => void; onExport: () => void; saveState: string }) {
  const tool = useEditor((s) => s.tool);
  const mode = useEditor((s) => s.mode);
  const codeOpen = useEditor((s) => s.codeOpen);
  const readOnly = useEditor((s) => s.readOnly);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const user = useCurrentUser();
  const [menu, setMenu] = useState<'file' | 'shapes' | null>(null);
  const [pickedShape, setLastShape] = useState(SHAPE_TOOLS[0]);
  const lastShape = SHAPE_TOOLS.find((t) => t.tool === tool) ?? pickedShape;
  const ref = useRef<HTMLDivElement>(null);
  const s = useEditor.getState();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const toolBtn = (t: Tool, icon: React.ReactNode, title: string) => (
    <button className={`icon-btn w-8 h-8 ${tool === t ? 'active' : ''}`} disabled={readOnly && t !== 'select' && t !== 'hand'} onClick={() => s.set('tool', t)} title={title}>
      {icon}
    </button>
  );

  return (
    <div ref={ref} className="h-11 flex items-center gap-1 px-2 border-b border-line bg-bg1 shrink-0 relative z-30">
      <div className="relative">
        <button className="flex items-center gap-1 h-8 px-1 rounded hover:bg-bg3" onClick={() => setMenu(menu === 'file' ? null : 'file')} title="OpenRive menu">
          <AppIcon size={22} />
          <Menu size={13} className="text-t2" />
        </button>
        {menu === 'file' && (
          <div className="menu absolute left-0 top-10 w-60">
            <Link href="/" className="menu-item">
              Back to files
            </Link>
            <div className="menu-sep" />
            <button className="menu-item" disabled={readOnly} onClick={() => (onSave(), setMenu(null))}>
              <Save size={13} /> Save <span className="shortcut">Ctrl S</span>
            </button>
            <button className="menu-item" onClick={() => (onExport(), setMenu(null))}>
              <Download size={13} /> Export .riv <span className="shortcut">Ctrl E</span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" disabled={!canUndo} onClick={() => (s.undo(), setMenu(null))}>
              <Undo2 size={13} /> Undo <span className="shortcut">Ctrl Z</span>
            </button>
            <button className="menu-item" disabled={!canRedo} onClick={() => (s.redo(), setMenu(null))}>
              <Redo2 size={13} /> Redo <span className="shortcut">Ctrl Shift Z</span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => (window.dispatchEvent(new Event('editor:fit')), setMenu(null))}>
              Zoom to fit <span className="shortcut">Shift 1</span>
            </button>
            <button className="menu-item" onClick={() => (runAction('file.preview'), setMenu(null))}>
              <Play size={13} /> Open preview <span className="shortcut">Ctrl P</span>
            </button>
            <div className="menu-sep" />
            <button className="menu-item" onClick={() => (runAction('file.prefs'), setMenu(null))}>
              <Settings size={13} /> Preferences <span className="shortcut">Ctrl ,</span>
            </button>
            <button className="menu-item" onClick={() => (runAction('file.shortcuts'), setMenu(null))}>
              <Keyboard size={13} /> Keyboard shortcuts <span className="shortcut">?</span>
            </button>
          </div>
        )}
      </div>
      <div className="w-px h-5 bg-line2 mx-1" />
      {toolBtn('select', <MousePointer2 size={15} />, 'Select (V)')}
      {toolBtn('artboard', <Frame size={15} />, 'Artboard (A)')}
      <div className="relative flex">
        {toolBtn(lastShape.tool, lastShape.icon, `${lastShape.label}${lastShape.key ? ` (${lastShape.key})` : ''}`)}
        <button className="w-4 h-8 text-t2 hover:text-t0" disabled={readOnly} onClick={() => setMenu(menu === 'shapes' ? null : 'shapes')}>
          <ChevronDown size={12} />
        </button>
        {menu === 'shapes' && (
          <div className="menu absolute left-0 top-10">
            {SHAPE_TOOLS.map((t) => (
              <button
                key={t.tool}
                className="menu-item"
                onClick={() => {
                  s.set('tool', t.tool);
                  setLastShape(t);
                  setMenu(null);
                }}
              >
                {t.icon} {t.label} {t.key && <span className="shortcut">{t.key}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {toolBtn('text', <Type size={15} />, 'Text (T)')}
      {toolBtn('pen', <PenTool size={15} />, 'Pen (P)')}
      <button
        className="icon-btn w-8 h-8"
        disabled={readOnly}
        onClick={() => runAction('object.group')}
        title="Group selection (Ctrl G)"
      >
        <FolderPlus size={15} />
      </button>
      {toolBtn('hand', <Hand size={15} />, 'Hand (H, or hold Space)')}
      <div className="w-px h-5 bg-line2 mx-1" />
      <button className="icon-btn w-8 h-8" disabled={!canUndo || readOnly} onClick={() => s.undo()} title="Undo">
        <Undo2 size={15} />
      </button>
      <button className="icon-btn w-8 h-8" disabled={!canRedo || readOnly} onClick={() => s.redo()} title="Redo">
        <Redo2 size={15} />
      </button>

      <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
        <NameField />
        <span className="text-t3 text-[11px] whitespace-nowrap">{readOnly ? 'Read only' : saveState}</span>
      </div>

      <div className="flex bg-bg3 rounded-md p-0.5 mr-2">
        {(['design', 'animate'] as const).map((m) => (
          <button
            key={m}
            className={`px-3 h-7 rounded capitalize font-medium ${mode === m ? (m === 'animate' ? 'bg-anim text-white' : 'bg-accent-2 bg-[#3d8bd0] text-white') : 'text-t1'}`}
            onClick={() => s.setMode(m)}
            title={`${m === 'design' ? 'Design' : 'Animate'} mode (Tab)`}
          >
            {m}
          </button>
        ))}
      </div>
      <button
        className={`btn h-8 mr-1 ${codeOpen ? 'bg-bg3 text-t0' : ''}`}
        onClick={() => s.set('codeOpen', !codeOpen)}
        title="Code: automation scripts and embed snippets (Alt+C)"
      >
        <Braces size={14} /> Code
      </button>
      <button className="btn h-8 mr-1" onClick={() => runAction('file.preview')} title="Open a live preview in a new tab (Ctrl+P)">
        <Play size={14} /> Preview
      </button>
      <button className="btn btn-primary h-8" onClick={onExport}>
        <Download size={14} /> Export
      </button>
      {user && (
        <div className="ml-2">
          <Avatar user={user} size={26} />
        </div>
      )}
    </div>
  );
}

function NameField() {
  const name = useEditor((s) => s.projectName);
  const readOnly = useEditor((s) => s.readOnly);
  const [editing, setEditing] = useState(false);
  if (editing && !readOnly) {
    return (
      <input
        autoFocus
        className="field w-56 h-7 text-center"
        defaultValue={name}
        onBlur={(e) => {
          setEditing(false);
          const v = e.target.value.trim();
          if (v && v !== name) {
            useEditor.getState().setProjectName(v);
            window.dispatchEvent(new CustomEvent('editor:rename', { detail: v }));
          }
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button className="font-medium truncate max-w-[300px] px-2 h-7 rounded hover:bg-bg3" onClick={() => setEditing(true)}>
      {name}
    </button>
  );
}
