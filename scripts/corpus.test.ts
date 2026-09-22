// Round-trips every .riv in a folder through import -> export -> import.
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { exportRiv, importRiv } from '../src/lib/rive/document';
import { readRiv } from '../src/lib/rive/riv-format';

const dir = process.argv[2];
let ok = 0, identical = 0, sameCounts = 0, total = 0, danglingFiles = 0;
const failures: string[] = [];
const nonIdentical: string[] = [];
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.riv') ? [join(d, f)] : []));
for (const path of walk(dir)) {
  const f = path.slice(dir.length + 1);
  total++;
  const bytes = new Uint8Array(readFileSync(path));
  try {
    const doc = importRiv(bytes);
    const out = exportRiv(doc);
    const back = importRiv(out);
    ok++;
    if (Buffer.from(out).equals(Buffer.from(bytes))) identical++;
    else nonIdentical.push(f);
    const a = readRiv(bytes).objects.map((o) => o.typeKey).sort().join(',');
    const b = readRiv(out).objects.map((o) => o.typeKey).sort().join(',');
    if (a === b) sameCounts++;
    else failures.push(`${f}: object set differs (${readRiv(bytes).objects.length} -> ${readRiv(out).objects.length})`);
    void back;
    // every parent / keyed object reference should resolve to an object id
    let dangling = 0;
    for (const ab of doc.artboards) {
      for (const o of ab.objects) if (typeof o.props.parentId === 'number') dangling++;
      for (const a of ab.animations) for (const ko of a.children ?? []) if (typeof ko.props.objectId === 'number') dangling++;
    }
    if (dangling) {
      danglingFiles++;
      failures.push(`${f}: ${dangling} unresolved references`);
    }
  } catch (e) {
    failures.push(`${f}: ${(e as Error).message}`);
  }
}
console.log({ total, ok, identical, sameCounts, danglingFiles });
console.log(failures.slice(0, 40).join('\n'));
console.log(nonIdentical.slice(0, 15).join('\n'));
