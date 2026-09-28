'use client';
// A floating panel anchored to a trigger element.
//
// Panels in the editor scroll and clip their contents, so popovers render in a
// portal on document.body. The position is measured after mount instead of
// guessed, which keeps a tall popover (the color picker, for example) on screen
// in every panel: it flips above the trigger when there is more room there, is
// clamped to the viewport, and scrolls internally when it still does not fit.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const MARGIN = 8;
const GAP = 6;

export interface PopoverProps {
  /** the element the popover is attached to */
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** horizontal alignment against the anchor */
  align?: 'start' | 'end';
  className?: string;
  children: ReactNode;
}

export function Popover({ anchorRef, onClose, align = 'end', className = '', children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const box = ref.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      const below = window.innerHeight - anchor.bottom - GAP - MARGIN;
      const above = anchor.top - GAP - MARGIN;
      // prefer below, unless it does not fit there and there is more room above
      const flip = box.height > below && above > below;
      const maxHeight = Math.max(120, flip ? above : below);
      const height = Math.min(box.height, maxHeight);
      const top = flip ? Math.max(MARGIN, anchor.top - GAP - height) : Math.min(anchor.bottom + GAP, window.innerHeight - MARGIN - height);
      const wanted = align === 'end' ? anchor.right - box.width : anchor.left;
      const left = Math.min(Math.max(MARGIN, wanted), Math.max(MARGIN, window.innerWidth - MARGIN - box.width));
      setStyle((prev) =>
        prev && prev.left === left && prev.top === top && prev.maxHeight === maxHeight ? prev : { left, top, maxHeight },
      );
    };
    place();
    // follow the anchor while panels scroll or the window changes size
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (ref.current) observer?.observe(ref.current);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [anchorRef, align]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={ref}
      className={`menu fixed z-[300] overflow-auto ${className}`}
      style={{
        left: style?.left ?? -9999,
        top: style?.top ?? -9999,
        maxHeight: style?.maxHeight,
        // hidden until measured, so it never flashes in the wrong place
        visibility: style ? 'visible' : 'hidden',
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
