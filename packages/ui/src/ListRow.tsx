'use client';
// A selectable row with hover actions, shared by the assets list, the script
// list and other small panel lists.
import type { ReactNode } from 'react';

export interface ListRowProps {
  selected?: boolean;
  /** shown only while the row is hovered (or always when the row is selected) */
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
  title?: string;
  draggable?: boolean;
  children: ReactNode;
  onClick?: () => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
}

export function ListRow({ selected, actions, icon, className = '', children, ...rest }: ListRowProps) {
  return (
    <div
      className={`group flex items-center gap-2 px-1 h-7 rounded cursor-pointer ${selected ? 'bg-bg3 text-t0' : 'text-t1 hover:bg-bg2'} ${className}`}
      {...rest}
    >
      {icon}
      <div className="flex-1 min-w-0">{children}</div>
      {actions && <div className={`flex items-center gap-1 ${selected ? '' : 'opacity-0 group-hover:opacity-100'}`}>{actions}</div>}
    </div>
  );
}
