// The preview bundle must be a valid zip whose entries survive unpacking, and it
// must describe the file's artboards, timelines, state machines and inputs.
import { readFileSync, writeFileSync } from 'fs';
import { bundleFiles, bundleManifest, buildBundle, bundleFileName, slug } from '@openrive/rive/bundle';
import { exportRiv, importRiv } from '@openrive/rive/document';
import { getTemplate } from '@openrive/rive/templates';

const font = { name: 'Inter', bytes: new Uint8Array(readFileSync('apps/web/public/fonts/Inter-Regular.ttf')) };
const doc = getTemplate('interactive-button')!.build(font);
const riv = exportRiv(doc);
const runtimeFiles = [
  { name: 'canvas_advanced.mjs', data: new Uint8Array(readFileSync('apps/web/public/rive/canvas_advanced.mjs')) },
  { name: 'rive.wasm', data: new Uint8Array(readFileSync('apps/web/public/rive/rive.wasm')) },
];

const manifest = bundleManifest({ name: 'My Button!', riv, doc });
console.log(`slug ${slug('My Button!')} -> file ${manifest.file}, zip ${bundleFileName('My Button!')}`);
console.log(
  `manifest: ${manifest.artboards
    .map(
      (a) =>
        `${a.name} ${a.width}×${a.height} [tl: ${a.timelines.map((t) => t.name).join('|') || 'none'}] [sm: ${a.stateMachines
          .map((m) => `${m.name}(${m.inputs.map((i) => `${i.name}:${i.type}`).join(',') || 'no inputs'})`)
          .join('|') || 'none'}]`,
    )
    .join('; ')}`,
);

// ---------------------------------------------------------------------------
// a minimal zip reader: walks the central directory and checks every entry

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
const crc32 = (d: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function unzip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = zip.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('no end of central directory');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const out: { name: string; data: Uint8Array; crcOk: boolean }[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error(`bad central header at ${p}`);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (view.getUint32(offset, true) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const localNameLen = view.getUint16(offset + 26, true);
    const localExtra = view.getUint16(offset + 28, true);
    const start = offset + 30 + localNameLen + localExtra;
    const data = zip.subarray(start, start + size);
    out.push({ name, data, crcOk: crc32(data) === crc });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

for (const runtime of ['offline', 'cdn'] as const) {
  const zip = buildBundle({ name: 'My Button!', riv, doc, runtime, runtimeVersion: '2.42.2', runtimeFiles });
  const entries = unzip(zip);
  const expected = bundleFiles({ name: 'My Button!', riv, doc, runtime, runtimeFiles }).map((f) => f.name);
  const names = entries.map((e) => e.name);
  const same = names.length === expected.length && expected.every((n) => names.includes(n));
  const crcOk = entries.every((e) => e.crcOk);
  const rivEntry = entries.find((e) => e.name === manifest.file)!;
  const rivBack = Buffer.from(rivEntry.data).equals(Buffer.from(riv));
  const rivRoundTrips = Buffer.from(exportRiv(importRiv(new Uint8Array(rivEntry.data)))).equals(Buffer.from(riv));
  const js = new TextDecoder().decode(entries.find((e) => e.name === 'index.js')!.data);
  const html = new TextDecoder().decode(entries.find((e) => e.name === 'index.html')!.data);
  const base = runtime === 'cdn' ? 'https://unpkg.com/@rive-app/canvas-advanced@2.42.2/' : './runtime/';
  console.log(
    `${runtime}: ${Math.round(zip.length / 1024)} KB, ${entries.length} entries ${same ? 'as listed' : `MISMATCH ${names.join(',')}`}` +
      `, crc ${crcOk ? 'ok' : 'BAD'}, .riv ${rivBack ? 'identical' : 'DIFF'} and ${rivRoundTrips ? 'round-trips' : 'DOES NOT ROUND-TRIP'}` +
      `, runtimeBase ${js.includes(`"runtimeBase": "${base}"`) ? 'ok' : 'WRONG'}` +
      `, index.html imports index.js: ${html.includes("from './index.js'")}` +
      `, mountPreview exported: ${js.includes('export async function mountPreview')}`,
  );
  if (runtime === 'offline') writeFileSync('scripts/bundle-test-out.zip', zip);
}
