// Low level .riv binary reader/writer.
// Format reference: https://rive.app/docs/runtimes/advanced-topic/format
//
//   "RIVE" | major:varuint | minor:varuint | fileId:varuint
//   ToC: propertyKey:varuint ... 0 | 2-bit backing class per key (4 per uint32)
//   objects: typeKey:varuint (propertyKey:varuint value)* 0
import { BinaryReader, BinaryWriter, zigzagDecode, zigzagEncode } from './binary';
import { backingClass, FieldType, propDefByKey, typeDefByKey } from './schema';

export interface RawProp {
  key: number;
  value: unknown;
  /** backing class from the ToC, used for properties this schema doesn't know */
  cls?: number;
}

export interface RawObject {
  typeKey: number;
  props: RawProp[];
}

export interface RivHeader {
  major: number;
  minor: number;
  fileId: number;
  /** original table of contents [propertyKey, backingClass], kept so untouched files round-trip exactly */
  toc?: [number, number][];
  /** property keys the original file used; those don't need new ToC entries */
  usedKeys?: number[];
}

export interface RawRiv {
  header: RivHeader;
  objects: RawObject[];
}

const FINGERPRINT = [0x52, 0x49, 0x56, 0x45]; // RIVE

export const DEFAULT_HEADER: RivHeader = { major: 7, minor: 4, fileId: 0 };

function readValue(r: BinaryReader, type: FieldType): unknown {
  switch (type) {
    case 'string':
      return r.readString();
    case 'bytes':
      return r.readBytes();
    case 'double':
      return r.readFloat32();
    case 'color':
      return r.readUint32();
    case 'bool':
      return r.readByte() === 1;
    case 'int':
      return zigzagDecode(r.readVarUint());
    default:
      return r.readVarUint();
  }
}

function readByClass(r: BinaryReader, cls: number): unknown {
  switch (cls) {
    case 1:
      return r.readBytes();
    case 2:
      return r.readFloat32();
    case 3:
      return r.readUint32();
    default:
      return r.readVarUint();
  }
}

export function readRiv(bytes: Uint8Array): RawRiv {
  const r = new BinaryReader(bytes);
  for (const b of FINGERPRINT) {
    if (r.readByte() !== b) throw new Error('Not a Rive file (missing RIVE fingerprint)');
  }
  const header: RivHeader = {
    major: r.readVarUint(),
    minor: r.readVarUint(),
    fileId: r.readVarUint(),
  };
  if (header.major !== 7) {
    throw new Error(`Unsupported .riv major version ${header.major} (expected 7)`);
  }
  const tocKeys: number[] = [];
  for (let k = r.readVarUint(); k !== 0; k = r.readVarUint()) tocKeys.push(k);
  const toc = new Map<number, number>();
  let bits = 0;
  let bit = 8;
  for (const k of tocKeys) {
    if (bit === 8) {
      bits = r.readUint32();
      bit = 0;
    }
    toc.set(k, (bits >>> bit) & 3);
    bit += 2;
  }
  header.toc = [...toc.entries()];

  const objects: RawObject[] = [];
  while (!r.isEOF) {
    const typeKey = r.readVarUint();
    const props: RawProp[] = [];
    for (;;) {
      const key = r.readVarUint();
      if (key === 0) break;
      const def = propDefByKey(key);
      // Trust the file's ToC over our schema when both know the key: the ToC
      // describes exactly how the author wrote it.
      const cls = toc.get(key);
      if (def && (cls === undefined || cls === backingClass(def.type))) {
        props.push({ key, value: readValue(r, def.type) });
      } else if (cls !== undefined) {
        props.push({ key, value: readByClass(r, cls), cls });
      } else {
        throw new Error(`Unknown property key ${key} on type ${typeKey} with no ToC entry`);
      }
    }
    objects.push({ typeKey, props });
  }
  header.usedKeys = [...new Set(objects.flatMap((o) => o.props.map((p) => p.key)))];
  return { header, objects };
}

function writeValue(w: BinaryWriter, type: FieldType, value: unknown) {
  switch (type) {
    case 'string':
      w.writeString(String(value ?? ''));
      break;
    case 'bytes':
      w.writeBytes(value instanceof Uint8Array ? value : new Uint8Array());
      break;
    case 'double':
      w.writeFloat32(Number(value) || 0);
      break;
    case 'color':
      w.writeUint32(Number(value) >>> 0);
      break;
    case 'bool':
      w.writeByte(value ? 1 : 0);
      break;
    case 'int':
      w.writeVarUint(zigzagEncode(Number(value) | 0));
      break;
    default:
      w.writeVarUint(Number(value) || 0);
  }
}

const classFieldType: FieldType[] = ['uint', 'bytes', 'double', 'color'];

export function writeRiv(raw: RawRiv): Uint8Array {
  // Collect every property key used, with its backing class, for the ToC.
  // Keys from the original file's ToC come first, in their original order.
  // Keys the original file already used without a ToC entry are known to its
  // target runtime; any other key gets an entry so older runtimes can skip it.
  const toc = new Map<number, number>(raw.header.toc ?? []);
  const used = new Set(raw.header.usedKeys ?? []);
  for (const o of raw.objects) {
    for (const p of o.props) {
      if (toc.has(p.key) || used.has(p.key)) continue;
      const def = propDefByKey(p.key);
      toc.set(p.key, p.cls ?? (def ? backingClass(def.type) : 0));
    }
  }
  const w = new BinaryWriter();
  for (const b of FINGERPRINT) w.writeByte(b);
  w.writeVarUint(raw.header.major);
  w.writeVarUint(raw.header.minor);
  w.writeVarUint(raw.header.fileId);
  const keys = [...toc.keys()];
  for (const k of keys) w.writeVarUint(k);
  w.writeVarUint(0);
  let bits = 0;
  let bit = 0;
  for (const k of keys) {
    bits |= (toc.get(k)! & 3) << bit;
    bit += 2;
    if (bit === 8) {
      w.writeUint32(bits);
      bits = 0;
      bit = 0;
    }
  }
  if (bit !== 0) w.writeUint32(bits);

  for (const o of raw.objects) {
    w.writeVarUint(o.typeKey);
    for (const p of o.props) {
      w.writeVarUint(p.key);
      if (p.cls !== undefined) {
        writeValue(w, classFieldType[p.cls], p.value);
      } else {
        const def = propDefByKey(p.key);
        writeValue(w, def ? def.type : 'uint', p.value);
      }
    }
    w.writeVarUint(0);
  }
  return w.toBytes();
}

export function typeNameOf(typeKey: number): string | undefined {
  return typeDefByKey(typeKey)?.name;
}
