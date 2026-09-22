'use client';
// Title row at the top of a left/right panel section: icon, title, actions.
import type { ReactNode } from 'react';

export function PanelHeader({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="panel-title flex-1">{title}</span>
      {children}
    </div>
  );
}
