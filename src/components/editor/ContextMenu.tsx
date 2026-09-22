'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Check, ChevronRight } from 'lucide-react';
import { ACTION_MAP, isEnabled, shortcutLabel } from './actions';

export type MenuItem =
  | { separator: true }
  | {
      /** registry action id: label, shortcut and enabled state come from the action */
      action?: string;
      label?: string;
      run?: () => void;
      disabled?: boolean;
      checked?: boolean;
      shortcut?: string;
      icon?: React.ReactNode;
      danger?: boolean;
      submenu?: MenuItem[];
    };

interface MenuState {
  menu: { x: number; y: number; items: MenuItem[] } | null;
  open(x: number, y: number, items: MenuItem[]): void;
  close(): void;
}

export const useContextMenu = create<MenuState>((set) => ({
  menu: null,
  open: (x, y, items) => set({ menu: { x, y, items } }),
  close: () => set({ menu: null }),
}));

/** Opens a context menu at the mouse position. */
export function openContextMenu(e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, items: MenuItem[]) {
  e.preventDefault();
  e.stopPropagation();
  useContextMenu.getState().open(e.clientX, e.clientY, items);
}

export const sep: MenuItem = { separator: true };
export const act = (action: string, extra: Partial<Extract<MenuItem, { action?: string }>> = {}): MenuItem => ({ action, ...extra });

function resolve(item: Exclude<MenuItem, { separator: true }>) {
  const a = item.action ? ACTION_MAP.get(item.action) : undefined;
  return {
    label: item.label ?? a?.label ?? '',
    shortcut: item.shortcut ?? (item.action ? shortcutLabel(item.action) : undefined),
    disabled: item.disabled ?? (a ? !isEnabled(a) : false),
    run: item.run ?? a?.run,
  };
}

function MenuList({ items, x, y, onDone, level = 0 }: { items: MenuItem[]; x: number; y: number; onDone: () => void; level?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);
  // keep the menu on screen
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let nx = x;
    let ny = y;
    if (nx + r.width > window.innerWidth - 4) nx = level ? x - r.width - 190 : window.innerWidth - r.width - 4;
    if (ny + r.height > window.innerHeight - 4) ny = Math.max(4, window.innerHeight - r.height - 4);
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);
  return (
    <div ref={ref} className="menu fixed min-w-[210px] py-1" style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item, i) => {
        if ('separator' in item) return <div key={i} className="menu-sep" />;
        const r = resolve(item);
        const hasSub = !!item.submenu?.length;
        return (
          <button
            key={i}
            className={`menu-item ${item.danger ? 'text-[#ffb4b4]' : ''}`}
            disabled={r.disabled}
            onMouseEnter={(e) => {
              if (hasSub) {
                const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setSub({ index: i, x: b.right + 2, y: b.top - 4 });
              } else setSub(null);
            }}
            onClick={() => {
              if (hasSub || r.disabled) return;
              onDone();
              r.run?.();
            }}
          >
            <span className="w-4 flex justify-center shrink-0">{item.checked ? <Check size={13} /> : item.icon}</span>
            <span className="flex-1 truncate">{r.label}</span>
            {r.shortcut && !hasSub && <span className="shortcut">{r.shortcut}</span>}
            {hasSub && <ChevronRight size={13} className="ml-auto text-t2" />}
          </button>
        );
      })}
      {sub && 'submenu' in items[sub.index] && (
        <MenuList
          items={(items[sub.index] as { submenu: MenuItem[] }).submenu}
          x={sub.x}
          y={sub.y}
          onDone={onDone}
          level={level + 1}
        />
      )}
    </div>
  );
}

export function ContextMenuHost() {
  const menu = useContextMenu((s) => s.menu);
  const close = useContextMenu((s) => s.close);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.menu')) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', close);
    };
  }, [menu, close]);
  if (!menu) return null;
  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <div className="pointer-events-auto">
        <MenuList items={menu.items} x={menu.x} y={menu.y} onDone={close} />
      </div>
    </div>
  );
}
