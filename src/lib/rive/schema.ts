// Rive core type schema, generated from rive-runtime's generated headers
// (see scripts/generate-core-defs.js). Every object in a .riv file is an
// instance of one of these types, identified by its typeKey.
import raw from './core-defs.json';

export type FieldType =
  | 'id'
  | 'uint'
  | 'int'
  | 'double'
  | 'string'
  | 'bytes'
  | 'bool'
  | 'color'
  | 'callback';

export interface PropDef {
  name: string;
  key: number;
  type: FieldType;
  default: unknown;
  /** false = editor-only property, the runtime skips it using the ToC */
  runtime: boolean;
  owner: string;
}

export interface TypeDef {
  name: string;
  typeKey: number;
  parent: string | null;
  ownProps: PropDef[];
  /** All properties including inherited ones. */
  props: PropDef[];
  propsByName: Map<string, PropDef>;
  propsByKey: Map<number, PropDef>;
  ancestry: Set<string>;
  /** false for abstract types; the runtime reads those as null objects */
  instantiable: boolean;
}

type RawType = [string, number, string | null, [string, number, FieldType, unknown, number][], number];

const types = new Map<string, TypeDef>();
const typesByKey = new Map<number, TypeDef>();
const propsByKey = new Map<number, PropDef>();

for (const [name, typeKey, parent, props, instantiable] of raw as RawType[]) {
  const def: TypeDef = {
    name,
    typeKey,
    parent,
    ownProps: props.map(([pname, key, type, dflt, runtime]) => ({
      name: pname,
      key,
      type,
      default: dflt,
      runtime: !!runtime,
      owner: name,
    })),
    props: [],
    propsByName: new Map(),
    propsByKey: new Map(),
    ancestry: new Set(),
    instantiable: !!instantiable,
  };
  types.set(name, def);
  typesByKey.set(typeKey, def);
  for (const p of def.ownProps) propsByKey.set(p.key, p);
}

function resolve(def: TypeDef) {
  if (def.props.length || def.ancestry.size) return;
  const chain: TypeDef[] = [];
  let cur: TypeDef | undefined = def;
  while (cur) {
    chain.unshift(cur);
    def.ancestry.add(cur.name);
    cur = cur.parent ? types.get(cur.parent) : undefined;
  }
  for (const t of chain) {
    for (const p of t.ownProps) {
      def.props.push(p);
      def.propsByKey.set(p.key, p);
      // a runtime property wins over an editor-only alias with the same name
      if (!def.propsByName.has(p.name) || p.runtime) def.propsByName.set(p.name, p);
    }
  }
}
for (const def of types.values()) resolve(def);

export function typeDef(name: string): TypeDef {
  const t = types.get(name);
  if (!t) throw new Error(`Unknown Rive type ${name}`);
  return t;
}
export function typeDefByKey(key: number): TypeDef | undefined {
  return typesByKey.get(key);
}
export function hasType(name: string) {
  return types.has(name);
}
export function propDefByKey(key: number): PropDef | undefined {
  return propsByKey.get(key);
}
export function isA(typeName: string, base: string): boolean {
  const t = types.get(typeName);
  return !!t && t.ancestry.has(base);
}
export function propKey(typeName: string, prop: string): number {
  const p = typeDef(typeName).propsByName.get(prop);
  if (!p) throw new Error(`${typeName} has no property ${prop}`);
  return p.key;
}
export function propDef(typeName: string, prop: string): PropDef | undefined {
  return types.get(typeName)?.propsByName.get(prop);
}
export function defaultValue(typeName: string, prop: string): unknown {
  const p = propDef(typeName, prop);
  if (!p) return undefined;
  if (p.default !== null && p.default !== undefined) return p.default;
  switch (p.type) {
    case 'string':
      return '';
    case 'bool':
      return false;
    case 'bytes':
      return new Uint8Array();
    default:
      return 0;
  }
}

/** ToC backing class: 0 = varuint, 1 = string/bytes, 2 = float32, 3 = uint32 color */
export function backingClass(t: FieldType): 0 | 1 | 2 | 3 {
  switch (t) {
    case 'string':
    case 'bytes':
      return 1;
    case 'double':
      return 2;
    case 'color':
      return 3;
    default:
      return 0;
  }
}

export const allTypes = () => [...types.values()];
