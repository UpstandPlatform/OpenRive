'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsList, TabsTrigger } from './components/tabs';
import { cn } from './lib/utils';

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: ReactNode;
  title?: string;
}

export interface TabStripProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: 'underline' | 'pill';
  className?: string;
}

export function TabStrip<T extends string>({ items, value, onChange, variant = 'underline', className }: TabStripProps<T>) {
  const underline = variant === 'underline';

  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)} className={cn('min-w-0', className)}>
      <TabsList
        variant={underline ? 'line' : 'default'}
        className={cn(
          underline ? 'h-8 w-full justify-stretch gap-0 rounded-none p-0' : 'h-6 gap-1 rounded-md p-0.5',
        )}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.id}
            value={item.id}
            title={item.title}
            className={cn(
              'min-w-0 gap-1.5 text-[11px] font-semibold',
              underline ? 'h-full flex-1 rounded-none px-2' : 'h-full flex-none rounded-sm px-2',
            )}
          >
            {item.icon}
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
