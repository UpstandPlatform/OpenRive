'use client';
// The editor's two tab strips: underlined panel tabs (Layers / Theme / Assets)
// and small pill tabs inside panels (Scripts / Embed / Rive scripting).
import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export function Tabs<T extends string>({ items, value, onChange, variant = 'underline', className = '' }: TabsProps<T>) {
  const underline = variant === 'underline';
  return (
    <div className={`${underline ? 'h-8 flex items-stretch border-b border-line' : 'flex items-center gap-1'} ${className}`} role="tablist">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            title={item.title}
            className={
              underline
                ? `flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold ${active ? 'text-t0 border-b-2 border-accent' : 'text-t2 hover:text-t1'}`
                : `px-2 h-6 rounded text-[11px] font-semibold inline-flex items-center gap-1 ${active ? 'bg-bg3 text-t0' : 'text-t2 hover:text-t1'}`
            }
            onClick={() => onChange(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
