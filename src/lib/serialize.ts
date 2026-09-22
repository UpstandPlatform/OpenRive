// JSON (de)serialization that preserves Uint8Array values (image bytes etc.).
function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function stringifyDoc(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v instanceof Uint8Array ? { $bytes: toBase64(v) } : v));
}

export function parseDoc<T>(json: string): T {
  return JSON.parse(json, (_k, v) =>
    v && typeof v === 'object' && typeof v.$bytes === 'string' && Object.keys(v).length === 1 ? fromBase64(v.$bytes) : v,
  );
}

export { toBase64, fromBase64 };
