'use client';
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/dialog';
import { cn } from './lib/utils';

export interface ModalProps {
  title?: ReactNode;
  /** panel width in pixels (default 460) */
  width?: number;
  /** extra layout classes for the panel */
  className?: string;
  /** rendered on the right of the header, before the close button */
  headerRight?: ReactNode;
  /** hides the × button (dialogs that only close through their own buttons) */
  hideClose?: boolean;
  /** footer row, right aligned */
  footer?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ title, width = 460, className = '', headerRight, hideClose, footer, children, onClose }: ModalProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={!hideClose}
        className={cn('max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-none', className)}
        style={{ width, maxWidth: 'calc(100vw - 2rem)' }}
      >
        {(title || headerRight) && (
          <DialogHeader className="flex-row items-center gap-3 border-b border-border pb-3 pe-10">
            {title ? <DialogTitle className="min-w-0 flex-1">{title}</DialogTitle> : <DialogTitle className="sr-only">OpenRive dialog</DialogTitle>}
            {headerRight}
          </DialogHeader>
        )}
        {!title && !headerRight && <DialogTitle className="sr-only">OpenRive dialog</DialogTitle>}
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
