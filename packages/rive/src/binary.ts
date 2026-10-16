const utf8Decoder = new TextDecoder();
const utf8Encoder = new TextEncoder();

export class BinaryReader {
  private view: DataView;
  pos = 0;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get isEOF() {
    return this.pos >= this.bytes.length;
  }
  get length() {
    return this.bytes.length;
  }
  readByte(): number {
    if (this.pos >= this.bytes.length) throw new Error('Unexpected end of file');
    return this.bytes[this.pos++];
  }
  readVarUint(): number {
    const result = this.readVarUint64();
    if (result === (BigInt(1) << BigInt(64)) - BigInt(1)) return -1;
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('VarUint exceeds JavaScript safe integer range');
    return Number(result);
  }
  readVarUint64(): bigint {
    let result = BigInt(0);
    let shift = 0;
    for (;;) {
      const b = this.readByte();
      result |= BigInt(b & 0x7f) << BigInt(shift);
      if (!(b & 0x80)) break;
      shift += 7;
      if (shift > 63) throw new Error('VarUint overflow');
    }
    return result;
  }
  readFloat32(): number {
    if (this.pos + 4 > this.bytes.length) throw new Error('Unexpected end of file');
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readUint32(): number {
    if (this.pos + 4 > this.bytes.length) throw new Error('Unexpected end of file');
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  readBytes(): Uint8Array {
    const len = this.readVarUint();
    if (this.pos + len > this.bytes.length) throw new Error('Byte array out of range');
    const out = this.bytes.slice(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }
  readString(): string {
    return utf8Decoder.decode(this.readBytes());
  }
}

export class BinaryWriter {
  private buf = new Uint8Array(1024);
  private view = new DataView(this.buf.buffer);
  pos = 0;
  private ensure(n: number) {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(next.buffer);
  }
  writeByte(b: number) {
    this.ensure(1);
    this.buf[this.pos++] = b & 0xff;
  }
  writeVarUint(value: number) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error('VarUint must be a finite integer');
    if (value < 0) {
      if (value !== -1) throw new Error('VarUint cannot be negative except for the empty ID sentinel');
      let v = (BigInt(1) << BigInt(64)) - BigInt(1);
      while (v > BigInt(0)) {
        const b = Number(v & BigInt(0x7f));
        v >>= BigInt(7);
        this.writeByte(v > BigInt(0) ? b | 0x80 : b);
      }
      return;
    }
    if (!Number.isSafeInteger(value)) throw new Error('VarUint exceeds JavaScript safe integer range');
    let v = Math.floor(value);
    do {
      let b = v % 128;
      v = Math.floor(v / 128);
      if (v > 0) b |= 0x80;
      this.writeByte(b);
    } while (v > 0);
  }
  writeVarUint64(value: number | bigint) {
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('VarUint64 number must be a non-negative safe integer');
      value = BigInt(value);
    }
    if (value < BigInt(0) || value > (BigInt(1) << BigInt(64)) - BigInt(1)) throw new Error('VarUint64 is outside the unsigned 64-bit range');
    let v = value;
    do {
      const b = Number(v & BigInt(0x7f));
      v >>= BigInt(7);
      this.writeByte(v > BigInt(0) ? b | 0x80 : b);
    } while (v > BigInt(0));
  }
  writeFloat32(v: number) {
    this.ensure(4);
    this.view.setFloat32(this.pos, v, true);
    this.pos += 4;
  }
  writeUint32(v: number) {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
  }
  writeBytes(bytes: Uint8Array) {
    this.writeVarUint(bytes.length);
    this.ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }
  writeString(s: string) {
    this.writeBytes(utf8Encoder.encode(s));
  }
  toBytes(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

export const zigzagEncode = (n: number) => ((n << 1) ^ (n >> 31)) >>> 0;
export const zigzagDecode = (n: number) => (n >>> 1) ^ -(n & 1);
