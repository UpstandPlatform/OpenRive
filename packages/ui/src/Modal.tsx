'use client';
// One dialog shell for every modal in OpenRive: overlay, panel, optional header
// with a close button, Escape to close, and clicks inside that don't close it.
import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

export interface ModalProps {
  title?: ReactNode;
  /** panel width in pixels (default 460) */
  width?: number;
  /** extra classes for the panel, e.g. 'max-h-[85vh] flex flex-col' */
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onMouseDown={onClose}>
      <div
        className={`bg-bg2 rounded-xl border border-line2 ${className}`}
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {(title || headerRight || !hideClose) && (
          <div className="flex items-center gap-3 p-4 border-b border-line">
            <h2 className="text-[14px] font-semibold flex-1">{title}</h2>
            {headerRight}
            {!hideClose && (
              <button className="icon-btn" onClick={onClose} aria-label="Close">
                <X size={15} />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div className="flex justify-end gap-2 p-4 pt-0">{footer}</div>}
      </div>
    </div>
  );
}
