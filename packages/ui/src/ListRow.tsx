'use client';
import type { ReactNode } from 'react';
import { Item, ItemActions, ItemContent, ItemMedia } from './components/item';
import { cn } from './lib/utils';

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

export function ListRow({ selected, actions, icon, className, children, ...rest }: ListRowProps) {
  return (
    <Item
      size="xs"
      variant={selected ? 'muted' : 'default'}
      className={cn(
        'group/list-row h-7 min-w-0 flex-nowrap gap-2 rounded-md border-transparent px-1 py-0 text-[11px]',
        selected ? 'text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        className,
      )}
      {...rest}
    >
      {icon && <ItemMedia className="size-4">{icon}</ItemMedia>}
      <ItemContent className="min-w-0 flex-1 gap-0">{children}</ItemContent>
      {actions && (
        <ItemActions className={cn('gap-1 transition-opacity', selected ? '' : 'opacity-0 group-hover/list-row:opacity-100 group-focus-within/list-row:opacity-100')}>
          {actions}
        </ItemActions>
      )}
    </Item>
  );
}
