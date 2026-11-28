// Rive Markup Language (RML) import.
//
// RML is the XML form of a Rive file that the Rive CLI compiles: every element
// is a core type, every attribute one of its properties (same names as the
// runtime), and nesting expresses the hierarchy. Object references use the
// element `id` attribute ("1:2") instead of stream indices, which maps directly
// onto RiveDoc's string ids, so exportRiv() does most of the index bookkeeping.
// https://rive.app/docs/runtimes/advanced-topic/rml
//
// What the CLI adds on top of the markup (editor defaults, enum names, nesting
// rules) was worked out against the .rml/.riv pairs in rive-runtime/tests.
import { CoreObj, isIndexable, newId, refSpaceOf, RiveDoc } from './document';
import { RivHeader } from './riv-format';
import { backingClass, defaultValue, hasType, isA, PropDef, propDef, propDefByKey, typeDef } from './schema';

export interface RmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: RmlElement[];
}

export interface RmlImportOptions {
  /** Reads a file an asset references with `file="…"`, relative to the scene. */
  readFile?: (path: string) => Uint8Array | undefined;
  /** Name of the artboard written first (rive.yaml `main`). */
  main?: string;
  /** Keep animation and layer names, which the current CLI leaves out of the file. */
  keepAnimationNames?: boolean;
}

export interface RmlImportResult {
  doc: RiveDoc;
  /** Things the importer skipped or couldn't resolve; empty for a clean import. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// XML

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      // a reference outside Unicode (&#99999999;) stays as written rather than throwing
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return Object.hasOwn(ENTITIES, e) ? ENTITIES[e]! : m;
  });
}

/** Parses the element tree of an RML document (its <Rive> root). Comments, the XML prolog and whitespace are ignored. */
export function parseRml(src: string): RmlElement {
  const root: RmlElement = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  const fail = (msg: string): never => {
    const line = src.slice(0, i).split('\n').length;
    throw new Error(`RML line ${line}: ${msg}`);
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.slice(i, lt).trim()) {
      i = lt;
      fail('unexpected text content');
    }
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) fail('unterminated comment');
      i = end + 3;
    } else if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2);
      if (end < 0) fail('unterminated processing instruction');
      i = end + 2;
    } else if (src.startsWith('</', i)) {
      const end = src.indexOf('>', i);
      // without this a closing tag that never ends would set the cursor back to the start and loop forever
      if (end < 0) fail('unterminated closing tag');
      const tag = src.slice(i + 2, end).trim();
      if (stack.length === 1) fail(`</${tag}> has no matching opening tag`);
      const open = stack.pop()!;
      if (open.tag !== tag) fail(`</${tag}> closes <${open.tag}>`);
      i = end + 1;
    } else {
      const m = /^<([A-Za-z_][\w.:-]*)/.exec(src.slice(i, i + 256));
      if (!m) fail('malformed tag');
      const el: RmlElement = { tag: m![1], attrs: {}, children: [] };
      i += m![0].length;
      const attr = /\s*([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')|\s*(\/?>)/y;
      for (;;) {
        attr.lastIndex = i;
        const a = attr.exec(src);
        if (!a) fail(`malformed attribute in <${el.tag}>`);
        i = attr.lastIndex;
        if (a![5]) {
          stack[stack.length - 1].children.push(el);
          if (a![5] === '>') stack.push(el);
          break;
        }
        el.attrs[a![1]] = decodeEntities(a![3] ?? a![4]);
      }
    }
  }
  if (stack.length !== 1) throw new Error(`RML: <${stack[stack.length - 1].tag}> is never closed`);
  return root.children.length === 1 && root.children[0].tag === 'Rive' ? root.children[0] : root;
}

// ---------------------------------------------------------------------------
// Enum names. RML accepts an enum's name or its integer; the names are the
// runtime's (and Yoga's, for layout) enumerators, also written in kebab-case.

const list = (...names: string[]) => Object.fromEntries(names.map((n, i) => [n, i]));
const SCALE_TYPE = list('fixed', 'fill', 'hug');
const UNITS = list('undefined', 'points', 'percent', 'auto');
const ENUMS: Record<string, Record<string, number>> = {
  layoutWidthScaleType: SCALE_TYPE,
  layoutHeightScaleType: SCALE_TYPE,
  instanceWidthScaleType: SCALE_TYPE,
  instanceHeightScaleType: SCALE_TYPE,
  flexDirectionValue: list('column', 'columnReverse', 'row', 'rowReverse'),
  positionTypeValue: list('static', 'relative', 'absolute'),
  'ScrollConstraint.directionValue': list('horizontal', 'vertical', 'all'),
  'DraggableConstraint.directionValue': list('horizontal', 'vertical', 'all'),
  'LayoutComponentStyle.directionValue': list('inherit', 'ltr', 'rtl'),
  layoutTypeValue: list('flex', 'grid'),
  animationStyleType: list('none', 'inherit', 'custom'),
  operationType: list(
    'add', 'subtract', 'multiply', 'divide', 'modulo', 'squareRoot', 'power', 'exp', 'log', 'cosine', 'sine', 'tangent', 'acosine', 'asine',
    'atangent', 'atangent2', 'round', 'floor', 'ceil',
  ),
  'GamepadInput.kind': list('button', 'axis', 'connected', 'disconnected'),
  alignItemsValue: list('auto', 'flexStart', 'center', 'flexEnd', 'stretch', 'baseline', 'spaceBetween', 'spaceAround', 'spaceEvenly'),
  alignSelfValue: list('auto', 'flexStart', 'center', 'flexEnd', 'stretch', 'baseline', 'spaceBetween', 'spaceAround', 'spaceEvenly'),
  alignContentValue: list('auto', 'flexStart', 'center', 'flexEnd', 'stretch', 'baseline', 'spaceBetween', 'spaceAround', 'spaceEvenly'),
  justifyContentValue: list('flexStart', 'center', 'flexEnd', 'spaceBetween', 'spaceAround', 'spaceEvenly'),
  flexWrapValue: list('noWrap', 'wrap', 'wrapReverse'),
  displayValue: list('flex', 'none'),
  overflowValue: list('visible', 'hidden', 'scroll'),
  interpolationType: list('hold', 'linear', 'cubic', 'elastic', 'scripted'),
  layoutAlignmentType: list(
    'topLeft', 'topCenter', 'topRight', 'centerLeft', 'center', 'centerRight', 'bottomLeft', 'bottomCenter', 'bottomRight',
    'spaceBetweenStart', 'spaceBetweenCenter', 'spaceBetweenEnd',
  ),
  listenerTypeValue: list(
    'enter', 'exit', 'down', 'up', 'move', 'event', 'click', 'componentProvided', 'textInput', 'dragStart', 'dragEnd',
    'viewModel', 'drag', 'focus', 'blur', 'keyboard', 'semanticAction', 'gamepad',
  ),
  role: list(
    'none', 'button', 'link', 'checkbox', 'switchControl', 'slider', 'textField', 'text', 'image', 'group', 'list', 'listItem',
    'tab', 'tabList', 'dialog', 'alertDialog', 'radioGroup', 'radioButton',
  ),
  loopValue: list('oneShot', 'loop', 'pingPong'),
  fit: list('fill', 'contain', 'cover', 'fitWidth', 'fitHeight', 'none', 'scaleDown', 'layout'),
  trackType: list('autoSize', 'points', 'percent', 'fr'),
  collection: list('templateColumns', 'templateRows', 'autoColumns', 'autoRows'),
  viewModelType: list('standard', 'textInput', 'global', 'textStyle'),
  artboardKind: list('standard', 'component', 'textStyle'),
  opValue: list('equal', 'notEqual', 'lessThanOrEqual', 'greaterThanOrEqual', 'lessThan', 'greaterThan'),
  inputValue: list(
    'none', 'pointerX', 'pointerY', 'pointerDeltaX', 'pointerDeltaY', 'keyPressed', 'text', 'focused', 'gamepadButtonPressed',
    'gamepadButtonValue', 'gamepadAxis', 'gamepadChangedValue',
  ),
  pointerButtonValue: list('primary', 'secondary', 'middle'),
  phaseValue: list('normal', 'capture'),
  sizingValue: list('autoWidth', 'autoHeight', 'fixed'),
  traversalKind: list('next', 'previous'),
  keyType: keys(),
};

/** The runtime's Key enum (GLFW key codes). */
function keys(): Record<string, number> {
  const k: Record<string, number> = {
    space: 32, apostrophe: 39, comma: 44, minus: 45, period: 46, slash: 47, semicolon: 59, equal: 61, leftBracket: 91, backslash: 92,
    rightBracket: 93, graveAccent: 96, world1: 161, world2: 162, escape: 256, enter: 257, tab: 258, backspace: 259, insert: 260,
    deleteKey: 261, right: 262, left: 263, down: 264, up: 265, pageUp: 266, pageDown: 267, home: 268, end: 269, capsLock: 280,
    scrollLock: 281, numLock: 282, printScreen: 283, pause: 284, kpDecimal: 330, kpDivide: 331, kpMultiply: 332, kpSubtract: 333,
    kpAdd: 334, kpEnter: 335, kpEqual: 336, leftShift: 340, leftControl: 341, leftAlt: 342, leftSuper: 343, rightShift: 344,
    rightControl: 345, rightAlt: 346, rightSuper: 347, menu: 348,
  };
  for (let i = 0; i < 10; i++) k[`key${i}`] = 48 + i;
  for (let i = 0; i < 26; i++) k[String.fromCharCode(97 + i)] = 65 + i;
  for (let i = 1; i <= 25; i++) k[`f${i}`] = 289 + i;
  for (let i = 0; i < 10; i++) k[`kp${i}`] = 320 + i;
  return k;
}

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function enumValue(type: string, prop: string, text: string): number | undefined {
  let table: Record<string, number> | undefined;
  for (let t: string | null = type; t && !table; t = typeDef(t).parent) table = ENUMS[`${t}.${prop}`];
  table ??= ENUMS[prop] ?? (prop.endsWith('UnitsValue') ? UNITS : undefined);
  return table?.[camel(text)];
}

// ---------------------------------------------------------------------------
// Editor defaults: properties the CLI writes even when the markup leaves them
// out, because the editor's default differs from the runtime's.

/** Editor defaults written ahead of everything else when the markup leaves them out. */
const LEADING_DEFAULTS: Record<string, string[]> = { Artboard: ['clip'] };

const EDITOR_DEFAULTS: Record<string, Record<string, unknown>> = {
  Artboard: { clip: false },
  ViewModelInstance: { name: 'Instance' },
  ScrollConstraint: { threshold: 2 },
  LayoutComponentStyle: Object.fromEntries(
    ['margin', 'padding'].flatMap((p) => ['Left', 'Right', 'Top', 'Bottom'].map((s) => [`${p}${s}UnitsValue`, 1]))
      .concat([['gapHorizontalUnitsValue', 1], ['gapVerticalUnitsValue', 1]]),
  ),
};

/**
 * Editor attributes that set one bit of a runtime flags property, from the
 * runtime's *Bitmask constants and flag enums (DrawableFlag, DataBindFlags,
 * StateTransitionFlags, …).
 */
const FLAG_ATTRS: Record<string, [prop: string, bit: number]> = {
  hidden: ['drawableFlags', 0],
  isTargetOpaque: ['drawableFlags', 3],
  participatesInLayout: ['drawableFlags', 8],
  selectable: ['drawableFlags', 10],
  direction: ['flags', 0],
  twoWay: ['flags', 1],
  once: ['flags', 2],
  round: ['flags', 0],
  input: ['componentProps', 0],
  disabled: ['flags', 0],
  durationIsPercentage: ['flags', 1],
  enableExitTime: ['flags', 2],
  exitTimeIsPercentage: ['flags', 3],
  pauseOnExit: ['flags', 4],
  enableEarlyExit: ['flags', 5],
  exitTimeIsPercetange: ['flags', 3], // sic: the editor's spelling
  fromViewModelProperty: ['flags', 2],
  random: ['flags', 0],
  reset: ['flags', 1],
  canFocus: ['focusFlags', 0],
  canTouch: ['focusFlags', 1],
  canTraverse: ['focusFlags', 2],
  wheelInteractive: ['scrollFlags', 0],
  cacheEnabled: ['cacheFlags', 0],
  dither: ['cacheFlags', 1],
  isVisible: ['maskFlags', 2],
  sourceDraws: ['maskFlags', 3],
  useCustomBounds: ['maskFlags', 4],
  ...Object.fromEntries(
    ['isExpandable', 'isSelectable', 'isCheckable', 'isToggleable', 'isRequirable', 'isEnablable', 'isFocusable'].map((n, i) => [n, ['traitFlags', i]]),
  ),
  ...Object.fromEntries(
    (
      [
        ['isExpanded', 0], ['isSelected', 1], ['isToggled', 4], ['isRequired', 5], ['isDisabled', 6], ['isFocused', 7], ['isHidden', 8],
        ['isLiveRegion', 9], ['isReadOnly', 10], ['isModal', 11], ['isObscured', 12], ['isMultiline', 13],
      ] as const
    ).map(([n, b]) => [n, ['stateFlags', b]]),
  ),
};

// ---------------------------------------------------------------------------
// Property order. The CLI writes a type's own properties first, then each base
// type's, every group in definition order (a mesh's triangle bytes come last).

const rankCache = new Map<string, Map<string, number>>();

function propRank(type: string): Map<string, number> {
  let rank = rankCache.get(type);
  if (rank) return rank;
  rank = new Map();
  for (let t: string | null = type; t; t = typeDef(t).parent) {
    for (const p of typeDef(t).ownProps) if (!rank.has(p.name)) rank.set(p.name, rank.size);
  }
  if (type === 'Mesh') rank.set('triangleIndexBytes', 1e6);
  rankCache.set(type, rank);
  return rank;
}

function canonicalOrder(type: string, props: Record<string, unknown>, leading?: Set<string>): Record<string, unknown> {
  const rank = propRank(type);
  const r = (k: string) => (leading?.has(k) ? -1 : (rank.get(k) ?? 1e9));
  const keys = Object.keys(props).sort((a, b) => r(a) - r(b));
  return Object.fromEntries(keys.map((k) => [k, props[k]]));
}

// ---------------------------------------------------------------------------
// Values

const sameValue = (a: unknown, b: unknown) => a === b || (typeof a === 'number' && typeof b === 'number' && Math.fround(a) === Math.fround(b));

// ---------------------------------------------------------------------------
// Import

/** Highest property key the CLI leaves out of the ToC. */
const BASELINE_KEY = 158;

/** Editor-side types the CLI writes as their runtime counterpart. */
const ALIASES: Record<string, string> = {
  ViewModelPropertyTextStyle: 'ViewModelPropertyArtboard',
  ViewModelInstanceTextStyle: 'ViewModelInstanceArtboard',
};

/** Editor-only elements: they describe the project, not the file. */
const EDITOR_ONLY = new Set(['Backboard', 'ComponentAsset']);

/** Index spaces exportRiv doesn't know, resolved here by element id. */
type LocalSpace = 'viewModelProperty' | 'converter' | 'physics' | 'enum' | 'artboard' | 'sibling';
const LOCAL_SPACES: Record<string, LocalSpace> = {
  viewModelPropertyId: 'viewModelProperty',
  converterId: 'converter',
  physicsId: 'physics',
  enumId: 'enum',
  'TextStyleGlobal.artboardId': 'artboard',
  'PaintImage.artboardId': 'artboard',
  // index among the target's own kind in its owner: an instance of its view
  // model, an animation or machine of a nested artboard
  'ViewModelInstanceListItem.viewModelInstanceId': 'sibling',
  'NestedAnimation.animationId': 'sibling',
};

function localSpace(type: string, prop: string): LocalSpace | undefined {
  if (LOCAL_SPACES[prop]) return LOCAL_SPACES[prop];
  for (let t: string | null = type; t; t = typeDef(t).parent) if (LOCAL_SPACES[`${t}.${prop}`]) return LOCAL_SPACES[`${t}.${prop}`];
  return undefined;
}

interface Entry {
  el: RmlElement;
  obj: CoreObj;
  parent?: RmlElement;
}

/**
 * Converts RML into an OpenRive document that exportRiv() can write. A project
 * split across several files passes them all, in path order, like the CLI.
 */
export function importRml(sources: string | string[], options: RmlImportOptions = {}): RmlImportResult {
  const warnings: string[] = [];
  const warn = (msg: string) => {
    if (!warnings.includes(msg)) warnings.push(msg);
  };
  const rive: RmlElement = { tag: 'Rive', attrs: {}, children: [] };
  for (const src of typeof sources === 'string' ? [sources] : sources) {
    const root = parseRml(src);
    if (root.tag !== 'Rive') throw new Error('RML: the document must have a single <Rive> root');
    rive.children.push(...root.children);
  }
  const header: RivHeader = { major: 7, minor: 5, fileId: 0 };
  const doc: RiveDoc = { header, top: [], artboards: [] };
  const entries = new Map<RmlElement, Entry>();
  const byId = new Map<string, Entry>();
  const pending: { entry: Entry; prop: string; text: string; kind: LocalSpace | 'path' | 'property' }[] = [];

  const leading = new Map<CoreObj, Set<string>>();
  const typeOf = (el: RmlElement) => ALIASES[el.tag] ?? el.tag;
  const known = (el: RmlElement) => {
    if (EDITOR_ONLY.has(el.tag)) return false;
    if (hasType(typeOf(el))) return true;
    warn(`unknown element <${el.tag}>`);
    return false;
  };

  const parseValue = (entry: Entry, pd: PropDef, name: string, text: string): unknown => {
    const { obj } = entry;
    switch (pd.type) {
      case 'string':
        return text;
      case 'bool':
        return text === 'true' || text === '1';
      case 'double':
        return Number(text);
      case 'color': {
        const hex = text.replace(/^#|^0x/i, '');
        return (parseInt(hex, 16) | (hex.length <= 6 ? 0xff000000 : 0)) >>> 0;
      }
      case 'bytes':
        if (/^\d+:\d+(-\d+:\d+)*$/.test(text)) {
          pending.push({ entry, prop: name, text, kind: 'path' });
          return undefined;
        }
        return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
      case 'id':
        if (/^-?\d+$/.test(text)) return Number(text);
        const local = localSpace(obj.type, name);
        if (local) {
          pending.push({ entry, prop: name, text, kind: local });
          return undefined;
        }
        if (!refSpaceOf(obj.type, name)) warn(`${obj.type}.${name}: don't know what "${text}" indexes`);
        return text;
      default: {
        if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
        if (text === 'true' || text === 'false') return text === 'true' ? 1 : 0;
        const v = enumValue(obj.type, name, text);
        if (v === undefined) warn(`${obj.type}.${name}: unknown value "${text}"`);
        return v;
      }
    }
  };

  const toObj = (el: RmlElement, parent?: RmlElement, componentParent?: string): CoreObj => {
    const type = typeOf(el);
    const obj: CoreObj = { id: el.attrs.id ?? newId(), type, props: {} };
    const entry: Entry = { el, obj, parent };
    entries.set(el, entry);
    if (el.attrs.id) byId.set(el.attrs.id, entry);
    const def = typeDef(type);
    const defaults = EDITOR_DEFAULTS[type] ?? {};
    for (const [name, value] of Object.entries(defaults)) obj.props[name] = value;
    for (const [name, text] of Object.entries(el.attrs)) {
      if (name === 'id') continue;
      if (name === 'property' && type === 'KeyedProperty') {
        pending.push({ entry, prop: 'propertyKey', text, kind: 'property' });
        continue;
      }
      const flag = FLAG_ATTRS[name];
      if (flag && def.propsByName.has(flag[0]) && !def.propsByName.get(name)?.runtime) {
        const [prop, bit] = flag;
        const bits = Number(obj.props[prop] ?? defaultValue(type, prop) ?? 0);
        const value = text === 'true' ? bits | (1 << bit) : bits & ~(1 << bit);
        if (sameValue(value, defaultValue(type, prop))) delete obj.props[prop];
        else obj.props[prop] = value;
        continue;
      }
      // editor-side attributes (stage position, export flags, …) have no runtime property
      const pd = def.propsByName.get(name);
      if (!pd || !pd.runtime) continue;
      const value = parseValue(entry, pd, name, text);
      if (value === undefined) continue;
      if (name in defaults) delete obj.props[name]; // explicit values take the normal position
      if (!sameValue(value, defaultValue(type, name))) obj.props[name] = value;
    }
    if (componentParent !== undefined && isA(type, 'Component')) obj.props.parentId = componentParent;
    const lead = (LEADING_DEFAULTS[type] ?? []).filter((k) => !(k in el.attrs));
    if (lead.length) leading.set(obj, new Set(lead));
    return obj;
  };

  /** Writes an element's subtree in stream order. */
  const emitTree = (el: RmlElement, parent: RmlElement | undefined, out: CoreObj[]) => {
    const obj = toObj(el, parent);
    const kids = el.children.filter(known);
    // The runtime attaches a bindable property to the object read right after
    // it (a comparator, a listener action), so those come first.
    // A listener action reading a view model property uses the last bind of
    // its bindable property, so the one it names (fromDataBindId) goes last.
    const from = parent?.attrs.fromDataBindId;
    if (from && isA(obj.type, 'BindableProperty')) {
      const i = kids.findIndex((c) => c.attrs.id === from);
      if (i >= 0) kids.push(...kids.splice(i, 1));
    }
    const bindables = kids.filter((c) => isA(typeOf(c), 'BindableProperty'));
    for (const c of bindables) emitTree(c, el, out);
    out.push(obj);
    for (const c of kids) if (!bindables.includes(c)) emitTree(c, el, out);
  };

  /** exportRiv writes a tree's children right after their owner, so a flat stream nests under its head. */
  const nest = (stream: CoreObj[]): CoreObj => {
    const [head, ...rest] = stream;
    if (rest.length) head.children = rest;
    return head;
  };

  // Scroll physics are file-level objects wherever the markup declares them.
  const physicsEls: RmlElement[] = [];
  const hoist = (el: RmlElement) => {
    el.children = el.children.filter((c) => {
      if (hasType(c.tag) && isA(c.tag, 'ScrollPhysics')) {
        physicsEls.push(c);
        return false;
      }
      hoist(c);
      return true;
    });
  };
  hoist(rive);

  const artboardEls = referenceOrder(
    rive.children.filter((el) => el.tag === 'Artboard'),
    (el) => el.tag === 'Artboard',
    ['artboardId'],
  );
  if (options.main) {
    const i = artboardEls.findIndex((el) => el.attrs.name === options.main);
    if (i < 0) warn(`main artboard "${options.main}" not found`);
    else {
      const main = referenceOrder([artboardEls[i], ...artboardEls], (el) => el.tag === 'Artboard', ['artboardId']);
      artboardEls.splice(0, artboardEls.length, ...main);
    }
  }

  const topEls = rive.children.filter((el) => el.tag !== 'Artboard' && known(el));
  const isConverter = (el: RmlElement) => isA(typeOf(el), 'DataConverter');
  const ordered = [
    ...topEls.filter((el) => isA(el.tag, 'FileAsset')),
    ...topEls.filter(isConverter),
    ...topEls.filter((el) => !isA(el.tag, 'FileAsset') && !isConverter(el)),
    ...physicsEls,
  ];
  for (const el of ordered) {
    const stream: CoreObj[] = [];
    emitTree(el, undefined, stream);
    if (isA(el.tag, 'FileAsset')) {
      if (el.attrs.file !== undefined) {
        const bytes = options.readFile?.(el.attrs.file);
        if (bytes) stream.push({ id: newId(), type: 'FileAssetContents', props: { bytes } });
        else warn(`<${el.tag}> file ${el.attrs.file} not found`);
      }
      doc.top.push(nest(stream));
    } else {
      doc.top.push(...stream);
    }
  }

  for (const el of artboardEls) {
    const artboard = toObj(el);
    const ab = { id: artboard.id, artboard, objects: [] as CoreObj[], animations: [] as CoreObj[], stateMachines: [] as CoreObj[] };
    const flatten = (parent: RmlElement, parentId: string) => {
      // an object's data binds follow it directly, ahead of its other children
      const kids = parent.children.filter(known);
      const binds = kids.filter((c) => isA(typeOf(c), 'DataBind'));
      for (const child of [...binds, ...kids.filter((c) => !binds.includes(c))]) {
        if (isA(child.tag, 'LinearAnimation')) {
          const stream: CoreObj[] = [];
          emitTree(child, parent, stream);
          ab.animations.push(nest(stream));
        } else if (isA(child.tag, 'StateMachine')) {
          // exportRiv scopes state and input indices per direct child of the machine
          const sm = toObj(child, parent);
          sm.children = stateMachineOrder(child.children.filter(known)).map((c) => {
            const stream: CoreObj[] = [];
            emitTree(c, child, stream);
            return nest(stream);
          });
          ab.stateMachines.push(sm);
        } else {
          const obj = toObj(child, parent, parentId);
          ab.objects.push(obj);
          flatten(child, isA(obj.type, 'Component') ? obj.id : parentId);
        }
      }
    };
    flatten(el, artboard.id);
    doc.artboards.push(ab);
  }

  resolveLocal(doc, pending, entries, byId, warn);
  // animations a nested artboard or a joystick drives keep their names
  const nestedTargets = new Set<string>();
  forEachObj(doc, (o) => {
    for (const [name, value] of Object.entries(o.props)) {
      const drives = (isA(o.type, 'NestedAnimation') && name === 'animationId') || (o.type === 'Joystick' && (name === 'xId' || name === 'yId'));
      if (drives && typeof value === 'string') nestedTargets.add(value);
    }
  });
  for (const { entry, text } of pending) if (isA(entry.obj.type, 'NestedAnimation')) nestedTargets.add(text);
  const keys = new Set<number>();
  forEachObj(doc, (o) => {
    // The CLI drops layer names, and the names of animations only state machines play.
    if (!options.keepAnimationNames && (isA(o.type, 'StateMachineLayer') || (isA(o.type, 'LinearAnimation') && !nestedTargets.has(o.id)))) {
      delete o.props.name;
    }
    o.props = canonicalOrder(o.type, o.props, leading.get(o));
    const def = typeDef(o.type);
    for (const name of Object.keys(o.props)) keys.add(def.propsByName.get(name)!.key);
  });
  // Like the CLI, give ToC entries (sorted) only to properties newer than the
  // ones every 7.x runtime knows.
  const sorted = [...keys].sort((a, b) => a - b);
  header.toc = sorted.filter((k) => k > BASELINE_KEY).map((k) => [k, backingClass(propDefByKey(k)!.type)]);
  header.usedKeys = sorted.filter((k) => k <= BASELINE_KEY);
  return { doc, warnings };
}

/**
 * Depth-first order over references: each root, then (recursively) the
 * elements of the wanted kind it references through `attrs`, each once.
 */
function referenceOrder(roots: RmlElement[], wanted: (el: RmlElement) => boolean, attrs: string[]): RmlElement[] {
  const ids = new Map<string, RmlElement>();
  const index = (el: RmlElement) => {
    if (el.attrs.id) ids.set(el.attrs.id, el);
    el.children.forEach(index);
  };
  roots.forEach(index);
  const out: RmlElement[] = [];
  const seen = new Set<RmlElement>();
  const visit = (el: RmlElement) => {
    if (seen.has(el)) return;
    seen.add(el);
    out.push(el);
    const scan = (node: RmlElement) => {
      for (const a of attrs) {
        const target = node.attrs[a] && ids.get(node.attrs[a]);
        if (target && wanted(target) && target !== el) visit(target);
      }
      node.children.forEach(scan);
    };
    scan(el);
  };
  roots.forEach(visit);
  return out;
}

/** Inputs, then layers, then listeners and the rest, each in markup order. */
function stateMachineOrder(children: RmlElement[]): RmlElement[] {
  const rank = (el: RmlElement) => (isA(el.tag, 'StateMachineInput') ? 0 : isA(el.tag, 'StateMachineLayer') ? 1 : 2);
  for (const layer of children.filter((c) => isA(c.tag, 'StateMachineLayer'))) layer.children = layerOrder(layer.children);
  return [...children].sort((a, b) => rank(a) - rank(b));
}

/** A layer always has an Any, an Exit and an Entry state; missing ones are added after the authored states. */
const SYSTEM_STATES = ['AnyState', 'ExitState', 'EntryState'];
function layerOrder(children: RmlElement[]): RmlElement[] {
  const missing = SYSTEM_STATES.filter((tag) => !children.some((c) => c.tag === tag));
  return [...children, ...missing.map((tag) => ({ tag, attrs: {}, children: [] }))];
}

function forEachObj(doc: RiveDoc, fn: (o: CoreObj) => void) {
  const walk = (o: CoreObj) => {
    fn(o);
    o.children?.forEach(walk);
  };
  doc.top.forEach(walk);
  for (const ab of doc.artboards) [ab.artboard, ...ab.objects, ...ab.animations, ...ab.stateMachines].forEach(walk);
}

function resolveLocal(
  doc: RiveDoc,
  pending: { entry: Entry; prop: string; text: string; kind: LocalSpace | 'path' | 'property' }[],
  entries: Map<RmlElement, Entry>,
  byId: Map<string, Entry>,
  warn: (msg: string) => void,
) {
  const indexIn = (list: CoreObj[]) => new Map(list.map((o, i) => [o.id, i]));
  const viewModels = indexIn(doc.top.filter((o) => isA(o.type, 'ViewModel')));
  const converters = indexIn(doc.top.filter((o) => isA(o.type, 'DataConverter') && o.type !== 'DataConverterGroupItem'));
  const physics = indexIn(doc.top.filter((o) => isA(o.type, 'ScrollPhysics')));
  const enums = indexIn(doc.top.filter((o) => isA(o.type, 'DataEnum')));
  const artboards = new Map(doc.artboards.map((a, i) => [a.id, i]));
  const siblingIndex = (id: string) => {
    const e = byId.get(id);
    if (!e?.parent) return undefined;
    const base = ['ViewModelInstance', 'LinearAnimation', 'StateMachine'].find((b) => isA(e.obj.type, b)) ?? e.obj.type;
    const i = e.parent.children.filter((c) => hasType(c.tag) && isA(c.tag, base)).indexOf(e.el);
    return i < 0 ? undefined : i;
  };
  const propIndex = (id: string) => {
    const e = byId.get(id);
    if (!e?.parent) return undefined;
    const i = e.parent.children.filter((c) => isA(ALIASES[c.tag] ?? c.tag, 'ViewModelProperty')).indexOf(e.el);
    return i < 0 ? undefined : i;
  };
  const space = (kind: LocalSpace, id: string) => {
    switch (kind) {
      case 'viewModelProperty':
        return propIndex(id);
      case 'converter':
        return converters.get(id);
      case 'physics':
        return physics.get(id);
      case 'enum':
        return enums.get(id);
      case 'artboard':
        return artboards.get(id);
      case 'sibling':
        return siblingIndex(id);
    }
  };

  for (const { entry, prop, text, kind } of pending) {
    const { obj } = entry;
    if (kind === 'path') {
      // a data bind path: the view model, then a property of it at each step
      const out: number[] = [];
      for (const [i, id] of text.split('-').entries()) {
        const v = i === 0 ? viewModels.get(id) : propIndex(id);
        if (v === undefined) {
          warn(`${obj.type}.${prop}: can't resolve ${id}`);
          break;
        }
        out.push(v);
      }
      obj.props[prop] = encodeVarUints(out);
    } else if (kind === 'property') {
      const keyedObject = entry.parent && entries.get(entry.parent);
      const target = keyedObject && byId.get(String(keyedObject.obj.props.objectId));
      const pd = target && propDef(target.obj.type, text);
      if (pd) obj.props[prop] = pd.key;
      else warn(`KeyedProperty: can't resolve property "${text}"`);
    } else {
      const v = space(kind, text);
      if (v === undefined) warn(`${obj.type}.${prop}: can't resolve ${text}`);
      else obj.props[prop] = v;
    }
  }

  // A component reference into another artboard (a listener on a nested
  // artboard's event) indexes that artboard's components.
  const owner = new Map<string, { ab: number; index: number }>();
  doc.artboards.forEach((ab, a) => {
    let i = 0;
    owner.set(ab.artboard.id, { ab: a, index: i++ });
    for (const o of ab.objects) if (isIndexable(o.type)) owner.set(o.id, { ab: a, index: i++ });
    const nested = (o: CoreObj) =>
      o.children?.forEach((c) => {
        if (isIndexable(c.type)) owner.set(c.id, { ab: a, index: i++ });
        nested(c);
      });
    [...ab.animations, ...ab.stateMachines].forEach(nested);
  });
  doc.artboards.forEach((ab, a) => {
    const fix = (o: CoreObj) => {
      for (const [name, value] of Object.entries(o.props)) {
        if (typeof value !== 'string' || refSpaceOf(o.type, name) !== 'component') continue;
        const target = owner.get(value);
        if (target && target.ab !== a) o.props[name] = target.index;
      }
      o.children?.forEach(fix);
    };
    [ab.artboard, ...ab.objects, ...ab.animations, ...ab.stateMachines].forEach(fix);
  });

  // A view model instance belongs to the view model it's declared in.
  for (const [id, index] of viewModels) {
    for (const inst of byId.get(id)?.el.children ?? []) {
      const e = entries.get(inst);
      if (e && e.obj.type === 'ViewModelInstance') e.obj.props.viewModelId = index;
    }
  }
}

function encodeVarUints(values: number[]): Uint8Array {
  const bytes: number[] = [];
  for (let v of values) {
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v) b |= 0x80;
      bytes.push(b);
    } while (v);
  }
  return new Uint8Array(bytes);
}
