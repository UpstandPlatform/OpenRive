'use client';
// Smooth zoom/pan transitions for "fit", "zoom to selection" and the zoom buttons.
import { useEditor, View } from './store/editor';

let raf = 0;

export function cancelViewTween() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Moves the view to `to` over a short ease-out. Zoom is interpolated on a log
 * scale so zooming in and out feel the same speed; pan follows the zoom so the
 * point under the target center stays on its path. Any wheel/drag cancels it.
 */
export function tweenView(to: View, ms = 220) {
  cancelViewTween();
  const s = useEditor.getState();
  const from = s.view;
  const same = Math.abs(from.zoom - to.zoom) < 1e-4 && Math.abs(from.panX - to.panX) < 0.5 && Math.abs(from.panY - to.panY) < 0.5;
  if (same) return;
  if (ms <= 0 || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
    s.set('view', to);
    return;
  }
  const t0 = performance.now();
  const lz0 = Math.log(from.zoom);
  const lz1 = Math.log(to.zoom);
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    useEditor.getState().set('view', {
      zoom: t === 1 ? to.zoom : Math.exp(lz0 + (lz1 - lz0) * e),
      panX: from.panX + (to.panX - from.panX) * e,
      panY: from.panY + (to.panY - from.panY) * e,
    });
    raf = t < 1 ? requestAnimationFrame(step) : 0;
  };
  raf = requestAnimationFrame(step);
}
