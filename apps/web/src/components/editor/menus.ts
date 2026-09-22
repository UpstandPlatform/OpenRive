'use client';
import { fillColorObject } from '@openrive/rive/api';
import { findArtboard, findObj } from '@openrive/rive/ops';
import { prop } from '@openrive/rive/scene';
import { isA } from '@openrive/rive/schema';
import { addSwatch, bindingOf, swatchColor } from '@openrive/rive/theme';
import { getActive, Tool, useEditor } from '@/lib/store/editor';
import { act, MenuItem, sep } from './ContextMenu';

function themeColorMenu(): MenuItem[] {
  const s = useEditor.getState();
  const { ab } = getActive();
  const o = ab && s.selection.length === 1 ? findObj(ab, s.selection[0]) : undefined;
  if (!ab || !o || !s.doc || (o.type !== 'Shape' && o.type !== 'Text' && o.type !== 'Artboard')) return [];
  const solid = fillColorObject(ab, o);
  if (!solid) return [];
  const swatches = s.doc.editor?.swatches ?? [];
  const bound = bindingOf(solid, 'colorValue');
  return [
    {
      label: 'Fill theme color',
      submenu: [
        ...swatches.map(
          (sw): MenuItem => ({
            label: sw.name,
            checked: bound === sw.id,
            run: () => s.setColor(solid.id, 'colorValue', swatchColor(s.doc!, sw.id) ?? prop(solid, 'colorValue'), sw.id),
          }),
        ),
        ...(swatches.length ? [sep] : []),
        {
          label: 'Save fill as new theme color…',
          run: () => {
            const name = prompt('Theme color name', `Color ${swatches.length + 1}`);
            if (!name) return;
            let id = '';
            s.commit((d) => {
              id = addSwatch(d, name, prop(solid, 'colorValue')).id;
            });
            s.setColor(solid.id, 'colorValue', prop(solid, 'colorValue'), id);
          },
        },
        ...(bound ? [{ label: 'Detach from theme', run: () => s.setColor(solid.id, 'colorValue', prop(solid, 'colorValue'), null) }] : []),
      ],
    },
  ];
}

/** Menu for right-clicking selected objects (stage or hierarchy). */
export function objectMenu(): MenuItem[] {
  const s = useEditor.getState();
  const { ab } = getActive();
  const one = ab && s.selection.length === 1 ? findObj(ab, s.selection[0]) : undefined;
  const isArtboard = one?.type === 'Artboard';
  const items: MenuItem[] = [];
  if (isArtboard) {
    items.push(act('edit.paste'), act('edit.selectAll'), sep, act('edit.rename'), act('edit.delete', { label: 'Delete artboard', danger: true }));
    items.push(sep, ...themeColorMenu(), act('view.zoomFit'));
    return items;
  }
  items.push(act('edit.cut'), act('edit.copy'), act('edit.paste'), act('edit.pasteInPlace'), act('edit.duplicate'), act('edit.delete', { danger: true }), sep);
  items.push(act('object.group'), act('object.ungroup'));
  if (one?.type === 'Text') items.push(act('object.enter', { label: 'Edit text' }));
  else if (one?.type === 'Shape') items.push(act('object.enter', { label: 'Edit vertices' }));
  else if (one?.type === 'Node') items.push(act('object.enter', { label: 'Select children' }));
  items.push(act('object.selectParent'), sep);
  items.push({
    label: 'Arrange',
    submenu: [act('arrange.front'), act('arrange.forward'), act('arrange.backward'), act('arrange.back')],
  });
  items.push({
    label: 'Align',
    submenu: [
      act('arrange.alignLeft'),
      act('arrange.alignHCenter'),
      act('arrange.alignRight'),
      sep,
      act('arrange.alignTop'),
      act('arrange.alignVCenter'),
      act('arrange.alignBottom'),
    ],
  });
  items.push({ label: 'Transform', submenu: [act('object.flipH'), act('object.flipV')] });
  items.push(...themeColorMenu(), sep);
  const hidden = one && isA(one.type, 'Drawable') && (prop(one, 'drawableFlags') & 1) === 1;
  const locked = one && isA(one.type, 'Drawable') && (prop(one, 'drawableFlags') & 2) === 2;
  items.push(act('object.hide', { label: hidden ? 'Show' : 'Hide' }), act('object.lock', { label: locked ? 'Unlock' : 'Lock' }), act('edit.rename'));
  if (s.mode === 'animate') items.push(sep, act('anim.key'));
  items.push(sep, act('view.zoomSelection'));
  return items;
}

const addTool = (label: string, tool: Tool): MenuItem => ({ label, run: () => useEditor.getState().set('tool', tool) });

/** Menu for right-clicking empty canvas. */
export function canvasMenu(): MenuItem[] {
  const s = useEditor.getState();
  return [
    act('edit.paste'),
    act('edit.pasteInPlace'),
    act('edit.selectAll'),
    sep,
    {
      label: 'Add',
      submenu: [
        addTool('Artboard', 'artboard'),
        addTool('Rectangle', 'rectangle'),
        addTool('Ellipse', 'ellipse'),
        addTool('Triangle', 'triangle'),
        addTool('Polygon', 'polygon'),
        addTool('Star', 'star'),
        addTool('Text', 'text'),
        addTool('Pen path', 'pen'),
      ].map((i) => ({ ...i, disabled: s.readOnly })),
    },
    sep,
    act('view.zoomIn'),
    act('view.zoomOut'),
    act('view.zoom100'),
    act('view.zoomFit'),
    sep,
    act('view.toggleMode', { label: s.mode === 'design' ? 'Switch to Animate' : 'Switch to Design' }),
    act('file.prefs'),
    act('file.shortcuts'),
  ];
}

export { findArtboard };
