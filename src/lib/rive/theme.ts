// Theme colors: a file defines named swatches once, colors bind to them, and
// switching or editing a theme recolors every bound color. Bindings live in
// editor-only `ui.bind` data; the exported .riv simply contains the resolved
// colors, so it plays in any runtime.
import { CoreObj, EditorMeta, newId, RiveDoc, Swatch, Theme } from './document';
import { walkTree } from './ops';

export function ensureEditorMeta(doc: RiveDoc): EditorMeta {
  if (!doc.editor) {
    const id = newId();
    doc.editor = { swatches: [], themes: [{ id, name: 'Default', colors: {} }], activeThemeId: id };
  }
  if (!doc.editor.themes.length) {
    const id = newId();
    doc.editor.themes.push({ id, name: 'Default', colors: {} });
    doc.editor.activeThemeId = id;
  }
  return doc.editor;
}

export function activeTheme(doc: RiveDoc): Theme | undefined {
  const meta = doc.editor;
  return meta?.themes.find((t) => t.id === meta.activeThemeId) ?? meta?.themes[0];
}

export function swatchColor(doc: RiveDoc, swatchId: string, themeId?: string): number | undefined {
  const theme = themeId ? doc.editor?.themes.find((t) => t.id === themeId) : activeTheme(doc);
  return theme?.colors[swatchId];
}

export function bindingOf(o: CoreObj, prop: string): string | undefined {
  const b = (o.ui?.bind as Record<string, string> | undefined)?.[prop];
  return typeof b === 'string' ? b : undefined;
}

/** Binds (or with null, unbinds) a color property to a swatch. */
export function bindColor(o: CoreObj, prop: string, swatchId: string | null) {
  const bind = { ...((o.ui?.bind as Record<string, string>) ?? {}) };
  if (swatchId) bind[prop] = swatchId;
  else delete bind[prop];
  o.ui = { ...o.ui, bind };
  if (!Object.keys(bind).length) delete o.ui.bind;
}

/** Every object in the document that can hold a bound color (components and keyframes). */
function forEachBindable(doc: RiveDoc, fn: (o: CoreObj) => void) {
  for (const ab of doc.artboards) {
    for (const o of ab.objects) fn(o);
    for (const anim of ab.animations) walkTree(anim, fn);
  }
}

/** Writes the given theme's colors into every bound property. */
export function applyTheme(doc: RiveDoc, themeId?: string) {
  const meta = ensureEditorMeta(doc);
  if (themeId) meta.activeThemeId = themeId;
  const theme = activeTheme(doc);
  if (!theme) return;
  forEachBindable(doc, (o) => {
    const bind = o.ui?.bind as Record<string, string> | undefined;
    if (!bind) return;
    for (const [prop, swatchId] of Object.entries(bind)) {
      const c = theme.colors[swatchId];
      if (c !== undefined) o.props[prop] = c >>> 0;
    }
  });
}

export function addSwatch(doc: RiveDoc, name: string, color: number): Swatch {
  const meta = ensureEditorMeta(doc);
  const swatch = { id: newId(), name };
  meta.swatches.push(swatch);
  for (const t of meta.themes) t.colors[swatch.id] = color >>> 0;
  return swatch;
}

export function setSwatchColor(doc: RiveDoc, swatchId: string, color: number, themeId?: string) {
  const meta = ensureEditorMeta(doc);
  const theme = meta.themes.find((t) => t.id === (themeId ?? meta.activeThemeId));
  if (!theme) return;
  theme.colors[swatchId] = color >>> 0;
  if (theme.id === meta.activeThemeId) applyTheme(doc);
}

export function renameSwatch(doc: RiveDoc, swatchId: string, name: string) {
  const s = doc.editor?.swatches.find((x) => x.id === swatchId);
  if (s) s.name = name;
}

export function removeSwatch(doc: RiveDoc, swatchId: string) {
  const meta = ensureEditorMeta(doc);
  meta.swatches = meta.swatches.filter((s) => s.id !== swatchId);
  for (const t of meta.themes) delete t.colors[swatchId];
  forEachBindable(doc, (o) => {
    const bind = o.ui?.bind as Record<string, string> | undefined;
    if (!bind) return;
    for (const [prop, id] of Object.entries(bind)) if (id === swatchId) bindColor(o, prop, null);
  });
}

export function addTheme(doc: RiveDoc, name: string, copyFromId?: string): Theme {
  const meta = ensureEditorMeta(doc);
  const src = meta.themes.find((t) => t.id === (copyFromId ?? meta.activeThemeId));
  const theme = { id: newId(), name, colors: { ...(src?.colors ?? {}) } };
  meta.themes.push(theme);
  return theme;
}

export function removeTheme(doc: RiveDoc, themeId: string) {
  const meta = ensureEditorMeta(doc);
  if (meta.themes.length <= 1) return;
  meta.themes = meta.themes.filter((t) => t.id !== themeId);
  if (meta.activeThemeId === themeId) applyTheme(doc, meta.themes[0].id);
}

export function countBindings(doc: RiveDoc, swatchId: string): number {
  let n = 0;
  forEachBindable(doc, (o) => {
    const bind = o.ui?.bind as Record<string, string> | undefined;
    if (bind) for (const id of Object.values(bind)) if (id === swatchId) n++;
  });
  return n;
}
