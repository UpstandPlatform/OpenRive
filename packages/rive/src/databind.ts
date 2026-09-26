// Data binding: view model properties, and the objects that read and write them.
//
// Rive deprecated state machine inputs in favour of view model properties
// (https://rive.app/docs/editor/data-binding/migration-guide). A property can do
// everything an input can — drive transitions, be set by a pointer listener —
// plus types inputs never had, and runtimes read and write it without the
// deprecated inputs API.
//
// Layout written into the file (file level objects, in this order per model):
//
//   ViewModel { name }
//   ViewModelProperty<T> { name }          ← one per property, in index order
//   ViewModelInstance { viewModelId, name }
//   ViewModelInstance<T> { viewModelPropertyId, propertyValue }
//
// and the artboard points at the model with `viewModelId`. References are
// indices: `viewModelId` counts ViewModel objects in the file, and
// `viewModelPropertyId` counts properties inside their own model. A data bind
// reaches a property through `sourcePathIds`, a varuint path of
// [viewModelIndex, …nested properties…, propertyIndex].
import { ArtboardDoc, CoreObj, RiveDoc } from './document';
import { obj } from './factory';
import { isA } from './schema';

export type PropertyType = 'number' | 'boolean' | 'trigger' | 'string' | 'color';

export type PropertyValue = number | boolean | string;

interface TypeInfo {
  /** file level property declaration */
  property: string;
  /** the value it holds on an instance */
  instance: string;
  /** what a condition or listener binds to */
  bindable: string;
  /** property key of the bindable's value, named by the data bind */
  propertyKey: number;
  /** literal to compare a property against in a transition */
  comparator: string;
}

const TYPES: Record<PropertyType, TypeInfo> = {
  number: {
    property: 'ViewModelPropertyNumber',
    instance: 'ViewModelInstanceNumber',
    bindable: 'BindablePropertyNumber',
    propertyKey: 636,
    comparator: 'TransitionValueNumberComparator',
  },
  boolean: {
    property: 'ViewModelPropertyBoolean',
    instance: 'ViewModelInstanceBoolean',
    bindable: 'BindablePropertyBoolean',
    propertyKey: 634,
    comparator: 'TransitionValueBooleanComparator',
  },
  trigger: {
    property: 'ViewModelPropertyTrigger',
    instance: 'ViewModelInstanceTrigger',
    bindable: 'BindablePropertyTrigger',
    propertyKey: 686,
    comparator: 'TransitionValueTriggerComparator',
  },
  string: {
    property: 'ViewModelPropertyString',
    instance: 'ViewModelInstanceString',
    bindable: 'BindablePropertyString',
    propertyKey: 635,
    comparator: 'TransitionValueStringComparator',
  },
  color: {
    property: 'ViewModelPropertyColor',
    instance: 'ViewModelInstanceColor',
    bindable: 'BindablePropertyColor',
    propertyKey: 638,
    comparator: 'TransitionValueColorComparator',
  },
};

/** TransitionConditionOp in the runtime. */
export const CONDITION_OPS = { '==': 0, '!=': 1, '<=': 2, '>=': 3, '<': 4, '>': 5 } as const;
export type ConditionOp = keyof typeof CONDITION_OPS;

/** DataBindFlags.Direction: the bind writes into the view model. */
const TO_SOURCE = 1;

const PROPERTY_TYPES = Object.entries(TYPES).map(([k, v]) => [v.property, k as PropertyType] as const);
const INSTANCE_TYPES = Object.entries(TYPES).map(([k, v]) => [v.instance, k as PropertyType] as const);

export const propertyTypeOf = (coreType: string): PropertyType | undefined => PROPERTY_TYPES.find(([t]) => t === coreType)?.[1];
const instanceTypeOf = (coreType: string): PropertyType | undefined => INSTANCE_TYPES.find(([t]) => t === coreType)?.[1];

export interface PropertyDoc {
  /** the ViewModelProperty object */
  obj: CoreObj;
  /** the ViewModelInstance value holding the default, when the model has an instance */
  value?: CoreObj;
  name: string;
  type: PropertyType;
  /** index inside its view model */
  index: number;
  /** index of the view model in the file */
  viewModelIndex: number;
}

export interface ViewModelDoc {
  obj: CoreObj;
  name: string;
  /** index of this view model in the file */
  index: number;
  properties: PropertyDoc[];
  instance?: CoreObj;
  /** index of the instance in the file, -1 when there is none */
  instanceIndex: number;
}

// ---------------------------------------------------------------------------
// Reading

/** Every view model in the file, with its properties and default instance. */
export function viewModels(doc: RiveDoc): ViewModelDoc[] {
  const models: ViewModelDoc[] = [];
  const instances: { obj: CoreObj; index: number; values: CoreObj[] }[] = [];
  let model: ViewModelDoc | undefined;
  let instance: (typeof instances)[number] | undefined;

  for (const o of doc.top) {
    if (o.type === 'ViewModel') {
      model = { obj: o, name: String(o.props.name ?? ''), index: models.length, properties: [], instanceIndex: -1 };
      models.push(model);
      instance = undefined;
    } else if (isA(o.type, 'ViewModelProperty')) {
      const type = propertyTypeOf(o.type);
      if (model && type) {
        model.properties.push({ obj: o, name: String(o.props.name ?? ''), type, index: model.properties.length, viewModelIndex: model.index });
      } else if (model) {
        // a property type OpenRive cannot edit still occupies an index
        model.properties.push({ obj: o, name: String(o.props.name ?? ''), type: 'string', index: model.properties.length, viewModelIndex: model.index });
      }
    } else if (o.type === 'ViewModelInstance') {
      instance = { obj: o, index: instances.length, values: [] };
      instances.push(instance);
      model = undefined;
    } else if (isA(o.type, 'ViewModelInstanceValue')) {
      instance?.values.push(o);
    }
  }

  // the first instance of a model holds the values the file plays with
  for (const inst of instances) {
    const target = models[Number(inst.obj.props.viewModelId ?? 0)];
    if (!target || target.instance) continue;
    target.instance = inst.obj;
    target.instanceIndex = inst.index;
    for (const v of inst.values) {
      const p = target.properties[Number(v.props.viewModelPropertyId ?? 0)];
      if (p && !p.value) p.value = v;
    }
  }
  return models;
}

/** The view model an artboard is bound to, if any. */
export function artboardViewModel(doc: RiveDoc, ab: ArtboardDoc): ViewModelDoc | undefined {
  const id = ab.artboard.props.viewModelId;
  return typeof id === 'number' ? viewModels(doc)[id] : undefined;
}

/** The data binding properties an artboard exposes. */
export function properties(doc: RiveDoc, ab: ArtboardDoc): PropertyDoc[] {
  return artboardViewModel(doc, ab)?.properties ?? [];
}

export function findProperty(doc: RiveDoc, ab: ArtboardDoc, ref: string): PropertyDoc | undefined {
  const list = properties(doc, ab);
  return list.find((p) => p.obj.id === ref) ?? list.find((p) => p.name === ref);
}

/** The value a property starts with. */
export function propertyValue(p: PropertyDoc): PropertyValue | undefined {
  return p.value?.props.propertyValue as PropertyValue | undefined;
}

// ---------------------------------------------------------------------------
// Writing

/** varuint encoding of a source path, as the runtime reads it. */
export function encodePath(indices: number[]): Uint8Array {
  const out: number[] = [];
  for (const value of indices) {
    let v = value >>> 0;
    do {
      const byte = v & 0x7f;
      v >>>= 7;
      out.push(v ? byte | 0x80 : byte);
    } while (v);
  }
  return new Uint8Array(out);
}

const pathTo = (p: PropertyDoc) => encodePath([p.viewModelIndex, p.index]);

/** Where the next property of this model goes in doc.top. */
function propertyInsertAt(doc: RiveDoc, vm: ViewModelDoc): number {
  const start = doc.top.indexOf(vm.obj);
  let at = start + 1;
  while (at < doc.top.length && isA(doc.top[at]!.type, 'ViewModelProperty')) at++;
  return at;
}

/** Where the next instance value of this model goes in doc.top. */
function valueInsertAt(doc: RiveDoc, vm: ViewModelDoc): number {
  if (!vm.instance) return -1;
  const start = doc.top.indexOf(vm.instance);
  let at = start + 1;
  while (at < doc.top.length && isA(doc.top[at]!.type, 'ViewModelInstanceValue')) at++;
  return at;
}

/** The artboard's view model, created (with its instance) when missing. */
export function ensureViewModel(doc: RiveDoc, ab: ArtboardDoc, name?: string): ViewModelDoc {
  const existing = artboardViewModel(doc, ab);
  if (existing) return existing;
  const index = viewModels(doc).length;
  const model = obj('ViewModel', { name: name ?? `${ab.artboard.props.name || 'Artboard'} Data` });
  const instance = obj('ViewModelInstance', { viewModelId: index, name: 'Instance' });
  doc.top.push(model, instance);
  ab.artboard.props.viewModelId = index;
  return artboardViewModel(doc, ab)!;
}

function coerce(type: PropertyType, value: PropertyValue | undefined): PropertyValue | undefined {
  if (value === undefined) return undefined;
  if (type === 'boolean') return !!value;
  if (type === 'string') return String(value);
  if (type === 'color') return Number(value) >>> 0;
  if (type === 'trigger') return undefined; // a trigger has no stored value
  return Number(value) || 0;
}

/** Adds a data binding property to the artboard's view model. */
export function addProperty(
  doc: RiveDoc,
  ab: ArtboardDoc,
  p: { name: string; type: PropertyType; value?: PropertyValue; viewModelName?: string },
): PropertyDoc {
  const vm = ensureViewModel(doc, ab, p.viewModelName);
  const info = TYPES[p.type];
  const index = vm.properties.length;
  doc.top.splice(propertyInsertAt(doc, vm), 0, obj(info.property, { name: p.name }));
  const at = valueInsertAt(doc, vm);
  if (at >= 0) {
    const value = coerce(p.type, p.value);
    doc.top.splice(at, 0, obj(info.instance, {
      ...(vm.instanceIndex > 0 ? { parentId: vm.instanceIndex } : {}),
      viewModelPropertyId: index,
      ...(value !== undefined ? { propertyValue: value } : {}),
    }));
  }
  return findProperty(doc, ab, p.name)!;
}

/** Sets the value a property starts with. */
export function setPropertyValue(doc: RiveDoc, ab: ArtboardDoc, ref: string, value: PropertyValue) {
  const p = findProperty(doc, ab, ref);
  if (!p?.value) return undefined;
  const v = coerce(p.type, value);
  if (v === undefined) delete p.value.props.propertyValue;
  else p.value.props.propertyValue = v;
  return p;
}

export function renameProperty(doc: RiveDoc, ab: ArtboardDoc, ref: string, name: string) {
  const p = findProperty(doc, ab, ref);
  if (p) p.obj.props.name = name;
  return p;
}

// ---------------------------------------------------------------------------
// Conditions and listener actions

/** Every DataBindContext in the file, with the object that owns it. */
function dataBinds(doc: RiveDoc): { bind: CoreObj; owner: CoreObj }[] {
  const out: { bind: CoreObj; owner: CoreObj }[] = [];
  const walk = (o: CoreObj) => {
    for (const c of o.children ?? []) {
      if (c.type === 'DataBindContext') out.push({ bind: c, owner: o });
      walk(c);
    }
  };
  for (const ab of doc.artboards) {
    for (const sm of ab.stateMachines) walk(sm);
    for (const o of ab.objects) walk(o);
  }
  return out;
}

/** Decodes a varuint source path. */
export function decodePath(bytes: unknown): number[] {
  if (!(bytes instanceof Uint8Array)) return [];
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const b of bytes) {
    value |= (b & 0x7f) << shift;
    if (b & 0x80) {
      shift += 7;
    } else {
      out.push(value >>> 0);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/**
 * Removes a property, the conditions and listener actions that used it, and
 * renumbers everything that pointed past it.
 */
export function removeProperty(doc: RiveDoc, ab: ArtboardDoc, ref: string) {
  const vm = artboardViewModel(doc, ab);
  const p = findProperty(doc, ab, ref);
  if (!vm || !p) return false;

  // remember what every bind pointed at before the indices move
  const before = dataBinds(doc).map((b) => ({ ...b, path: decodePath(b.bind.props.sourcePathIds) }));

  doc.top = doc.top.filter((o) => o !== p.obj && o !== p.value);
  for (const later of vm.properties) {
    if (later.index > p.index && later.value) later.value.props.viewModelPropertyId = later.index - 1;
  }

  for (const { bind, owner, path } of before) {
    if (path.length !== 2 || path[0] !== vm.index) continue;
    if (path[1] === p.index) {
      // the condition or action has lost its property: drop it whole
      dropBindingGroup(doc, owner, bind);
    } else if (path[1]! > p.index) {
      bind.props.sourcePathIds = encodePath([path[0]!, path[1]! - 1]);
    }
  }
  return true;
}

/** Removes a condition (or a listener's action trio) that binds through `bind`. */
function dropBindingGroup(doc: RiveDoc, owner: CoreObj, bind: CoreObj) {
  if (owner.type === 'TransitionViewModelCondition') {
    const walk = (o: CoreObj) => {
      if (o.children?.includes(owner)) o.children = o.children.filter((c) => c !== owner);
      o.children?.forEach(walk);
    };
    for (const ab of doc.artboards) for (const sm of ab.stateMachines) walk(sm);
    return;
  }
  const kids = owner.children ?? [];
  const at = kids.indexOf(bind);
  if (at < 0) return;
  // [bindable, …binds…, ListenerViewModelChange]
  let from = at;
  while (from > 0 && !isA(kids[from - 1]!.type, 'BindableProperty')) from--;
  if (from > 0) from--;
  let to = at;
  while (to + 1 < kids.length && kids[to + 1]!.type === 'DataBindContext') to++;
  if (kids[to + 1]?.type === 'ListenerViewModelChange') to++;
  owner.children = kids.filter((_, i) => i < from || i > to);
}

/**
 * A transition condition that reads a property:
 *   TransitionViewModelCondition > BindableProperty<T> + DataBindContext +
 *   TransitionPropertyViewModelComparator + TransitionValue<T>Comparator
 */
export function propertyCondition(p: PropertyDoc, op: ConditionOp = '==', value?: PropertyValue): CoreObj {
  const info = TYPES[p.type];
  // a trigger fires: compare "changed" rather than a value
  const opValue = p.type === 'trigger' ? CONDITION_OPS['!='] : CONDITION_OPS[op];
  const literal: Record<string, PropertyValue> = {};
  if (p.type === 'boolean') literal.value = value === undefined ? true : !!value;
  else if (p.type === 'number') literal.value = Number(value ?? 0);
  else if (p.type === 'string') literal.value = String(value ?? '');
  else if (p.type === 'color') literal.value = Number(value ?? 0) >>> 0;
  return obj('TransitionViewModelCondition', opValue ? { opValue } : {}, [
    obj(info.bindable, {}),
    obj('DataBindContext', { propertyKey: info.propertyKey, sourcePathIds: pathTo(p) }),
    obj('TransitionPropertyViewModelComparator', {}),
    obj(info.comparator, literal),
  ]);
}

/**
 * The objects a listener needs to write a property:
 *   BindableProperty<T> (the value) + DataBindContext (to source) +
 *   ListenerViewModelChange
 */
export function propertyListenerAction(p: PropertyDoc, value?: PropertyValue): CoreObj[] {
  const info = TYPES[p.type];
  const v = p.type === 'boolean' ? value !== false : coerce(p.type, value);
  return [
    obj(info.bindable, v === undefined || v === false ? {} : { propertyValue: v }),
    obj('DataBindContext', { propertyKey: info.propertyKey, flags: TO_SOURCE, sourcePathIds: pathTo(p) }),
    obj('ListenerViewModelChange', {}),
  ];
}

// ---------------------------------------------------------------------------
// Converting a file's state machine inputs

const INPUT_TYPES: Record<string, PropertyType> = {
  StateMachineNumber: 'number',
  StateMachineBool: 'boolean',
  StateMachineTrigger: 'trigger',
};

export interface ConversionResult {
  /** properties created, by name */
  properties: string[];
  conditions: number;
  actions: number;
  /** inputs that had to stay, with the reason */
  kept: { name: string; reason: string }[];
}

/** Anything other than transitions and listeners that still needs an input. */
function otherInputUsers(sm: CoreObj): Map<string, string> {
  const blocked = new Map<string, string>();
  const walk = (o: CoreObj) => {
    const note =
      o.type === 'BlendAnimationDirect' || o.type === 'BlendState1DInput'
        ? 'a blend state still reads it'
        : isA(o.type, 'ListenerInputChange') && o.props.nestedInputId
          ? 'a nested artboard input still reads it'
          : o.type === 'ListenerBoolChange' && Number(o.props.value ?? 0) === 2
            ? 'a listener toggles it, which needs a data converter'
            : undefined;
    if (note && typeof o.props.inputId === 'string') blocked.set(o.props.inputId, note);
    o.children?.forEach(walk);
  };
  walk(sm);
  return blocked;
}

/**
 * Rewrites a state machine's inputs as view model properties: conditions read
 * the property, listeners write it, and the inputs go away. This is OpenRive's
 * "Convert inputs to data binding", the same move as Rive's editor.
 */
export function convertInputsToProperties(doc: RiveDoc, ab: ArtboardDoc, stateMachine?: CoreObj): ConversionResult {
  const machines = stateMachine ? [stateMachine] : ab.stateMachines;
  const result: ConversionResult = { properties: [], conditions: 0, actions: 0, kept: [] };

  for (const sm of machines) {
    const inputs = (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineInput') && INPUT_TYPES[c.type]);
    if (!inputs.length) continue;
    const blocked = otherInputUsers(sm);
    const byInput = new Map<string, PropertyDoc>();

    for (const input of inputs) {
      if (blocked.has(input.id)) continue;
      const type = INPUT_TYPES[input.type]!;
      const name = String(input.props.name ?? 'Property');
      const existing = findProperty(doc, ab, name);
      const p = existing?.type === type ? existing : addProperty(doc, ab, { name, type, value: input.props.value as PropertyValue | undefined });
      byInput.set(input.id, p);
      if (!existing) result.properties.push(name);
    }

    // conditions: TransitionInputCondition → TransitionViewModelCondition
    const convertConditions = (o: CoreObj) => {
      if (o.children?.length) {
        o.children = o.children.flatMap((c) => {
          if (isA(c.type, 'TransitionInputCondition') && typeof c.props.inputId === 'string') {
            const p = byInput.get(c.props.inputId);
            if (p) {
              result.conditions++;
              const op = c.type === 'TransitionNumberCondition' ? (Object.keys(CONDITION_OPS) as ConditionOp[])[Number(c.props.opValue ?? 0)] ?? '==' : '==';
              const value =
                c.type === 'TransitionBoolCondition'
                  ? Number(c.props.opValue ?? 0) !== 1
                  : c.type === 'TransitionNumberCondition'
                    ? Number(c.props.value ?? 0)
                    : undefined;
              return [propertyCondition(p, op, value)];
            }
          }
          convertConditions(c);
          return [c];
        });
      }
    };
    convertConditions(sm);

    // listener actions: Listener*Change → BindableProperty + DataBindContext + ListenerViewModelChange
    for (const listener of (sm.children ?? []).filter((c) => isA(c.type, 'StateMachineListener'))) {
      listener.children = (listener.children ?? []).flatMap((a) => {
        if (!isA(a.type, 'ListenerInputChange') || typeof a.props.inputId !== 'string') return [a];
        const p = byInput.get(a.props.inputId);
        if (!p) return [a];
        result.actions++;
        const value = a.type === 'ListenerBoolChange' ? Number(a.props.value ?? 1) === 1 : a.type === 'ListenerNumberChange' ? Number(a.props.value ?? 0) : undefined;
        return propertyListenerAction(p, value);
      });
    }

    for (const input of inputs) {
      const reason = blocked.get(input.id);
      if (reason) result.kept.push({ name: String(input.props.name ?? ''), reason });
    }
    // inputs that were fully converted can go
    sm.children = (sm.children ?? []).filter((c) => !byInput.has(c.id));
  }
  return result;
}

/** Whether this artboard still uses deprecated state machine inputs. */
export function usesInputs(ab: ArtboardDoc): boolean {
  return ab.stateMachines.some((sm) => (sm.children ?? []).some((c) => isA(c.type, 'StateMachineInput')));
}
