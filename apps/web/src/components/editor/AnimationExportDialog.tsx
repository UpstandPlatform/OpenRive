'use client';
import { useMemo, useState } from 'react';
import { Modal } from '@openrive/ui';
import type { RiveDoc } from '@openrive/rive/document';
import { downloadBytes } from '@/lib/client/projects';
import { encodeGif, encodeSpriteSheet, renderAnimationFrames } from '@/lib/client/animationExport';

export function AnimationExportDialog({ doc, projectName, onClose }: { doc: RiveDoc; projectName: string; onClose: () => void }) {
  const [artboardIndex, setArtboardIndex] = useState(0);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [fps, setFps] = useState(30);
  const [scale, setScale] = useState(1);
  const [format, setFormat] = useState<'gif' | 'spritesheet'>('gif');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const artboard = doc.artboards[artboardIndex];
  const timeline = artboard?.animations[animationIndex];
  const estimate = useMemo(() => {
    if (!timeline) return 0;
    const sourceFps = Number(timeline.props.fps);
    const safeFps = Number.isFinite(sourceFps) && sourceFps > 0 ? sourceFps : 60;
    const duration = Number(timeline.props.duration) / safeFps;
    return Math.max(1, Math.min(300, Math.ceil((Number.isFinite(duration) && duration > 0 ? duration : 1 / safeFps) * fps)));
  }, [timeline, fps]);

  const exportFrames = async () => {
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const rendered = await renderAnimationFrames(doc, { artboardIndex, animationIndex, fps, scale, maxPixels: format === 'gif' ? 24_000_000 : 16_000_000, onProgress: (done, total) => setProgress({ done, total }) });
      const stem = projectName.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'openrive-animation';
      if (format === 'gif') {
        const bytes = await encodeGif(rendered.frames, rendered.width, rendered.height, fps);
        downloadBytes(bytes, `${stem}.gif`);
      } else {
        const png = await encodeSpriteSheet(rendered.frames, rendered.width, rendered.height);
        const url = URL.createObjectURL(png);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${stem}-spritesheet.png`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      onClose();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <Modal title="Export animation frames" width={500} onClose={busy ? () => {} : onClose}>
      <div className="p-4 flex flex-col gap-4">
        <p className="text-[11px] text-t1">Render a timeline locally with the same Rive runtime OpenRive uses in the editor. The export stays on this device.</p>
        <label className="flex flex-col gap-1"><span className="label">Artboard</span>
          <select className="field h-8" value={artboardIndex} onChange={(e) => { setArtboardIndex(Number(e.target.value)); setAnimationIndex(0); }}>
            {doc.artboards.map((ab, i) => <option key={ab.id} value={i}>{String(ab.artboard.props.name || `Artboard ${i + 1}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="label">Timeline</span>
          <select className="field h-8" value={animationIndex} onChange={(e) => setAnimationIndex(Number(e.target.value))} disabled={!artboard?.animations.length}>
            {artboard?.animations.map((animation, i) => <option key={animation.id} value={i}>{String(animation.props.name || `Timeline ${i + 1}`)}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="label">Frame rate</span>
            <select className="field h-8" value={fps} onChange={(e) => setFps(Number(e.target.value))}>{[12, 15, 24, 30, 60].map((n) => <option key={n} value={n}>{n} fps</option>)}</select>
          </label>
          <label className="flex flex-col gap-1"><span className="label">Resolution</span>
            <select className="field h-8" value={scale} onChange={(e) => setScale(Number(e.target.value))}>{[0.5, 1, 2].map((n) => <option key={n} value={n}>{n === 1 ? '100%' : `${n * 100}%`}</option>)}</select>
          </label>
        </div>
        <div className="flex gap-2" role="group" aria-label="Export format">
          <button className={`btn flex-1 h-8 ${format === 'gif' ? 'btn-primary' : ''}`} onClick={() => setFormat('gif')}>Animated GIF</button>
          <button className={`btn flex-1 h-8 ${format === 'spritesheet' ? 'btn-primary' : ''}`} onClick={() => setFormat('spritesheet')}>PNG sprite sheet</button>
        </div>
        <p className="text-[10px] text-t2">{estimate} frames · {Math.round(Number(artboard?.artboard.props.width ?? 0) * scale)} × {Math.round(Number(artboard?.artboard.props.height ?? 0) * scale)} px per frame. Exports are limited to 300 frames.</p>
        {progress && <div className="text-[11px] text-t1" role="status">Rendering frame {progress.done} of {progress.total}…</div>}
        {error && <div className="text-[11px] text-red-300" role="alert">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={exportFrames} disabled={busy || !timeline}>{busy ? 'Rendering…' : 'Export'}</button>
        </div>
      </div>
    </Modal>
  );
}
