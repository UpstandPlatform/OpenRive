'use client';
import type { ReactNode } from 'react';
import { ItemActions, ItemHeader, ItemMedia, ItemTitle } from './components/item';

export function PanelHeader({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <ItemHeader className="min-w-0 basis-auto gap-2">
      {icon && <ItemMedia className="size-4">{icon}</ItemMedia>}
      <ItemTitle className="panel-title min-w-0 flex-1">{title}</ItemTitle>
      {children && <ItemActions className="gap-1">{children}</ItemActions>}
    </ItemHeader>
  );
}
