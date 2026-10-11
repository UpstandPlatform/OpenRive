'use client';
import { findArtboard } from '@openrive/rive/ops';
import { importSvg, inspectSvg } from '@openrive/rive/svg';
import { useEditor } from '@/lib/store/editor';
import { toast } from './toast';

export function importSvgMarkup(markup: string, name = 'Pasted SVG') {
  const state = useEditor.getState();
  if (!state.doc || state.readOnly) return false;
  const health = inspectSvg(markup);
  if (health.errors.length) throw new Error(health.errors.join(' '));
  const active = state.doc.artboards.find((a) => a.id === state.activeArtboardId) ?? state.doc.artboards[0];
  if (!active) throw new Error('Create an artboard before importing SVG.');
  const width = Number(active.artboard.props.width ?? 500);
  const height = Number(active.artboard.props.height ?? 500);
  const originX = Number(active.artboard.props.originX ?? 0);
  const originY = Number(active.artboard.props.originY ?? 0);
  let groupId: string | null = null;
  state.commit((doc) => {
    const artboard = findArtboard(doc, active.id);
    if (!artboard) return;
    groupId = importSvg(markup, {
      artboard,
      x: width * (0.5 - originX),
      y: height * (0.5 - originY),
      width: Math.min(width, height) * 0.8,
      name,
    }).group.id;
  });
  if (groupId) state.select([groupId]);
  toast(health.warnings.length ? `Imported SVG; ${health.warnings.length} unsupported feature${health.warnings.length === 1 ? '' : 's'} skipped` : 'Imported SVG as editable vector shapes');
  if (health.warnings.length) window.dispatchEvent(new CustomEvent('editor:svg-import-warnings', { detail: health.warnings }));
  return !!groupId;
}
