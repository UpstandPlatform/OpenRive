import { newDoc, newParametricShape } from '../src/lib/rive/factory';
import { exportRiv, importRiv } from '../src/lib/rive/document';
import { writeFileSync } from 'fs';
const doc = newDoc('Main');
const ab = doc.artboards[0];
ab.objects.push(...newParametricShape('rectangle', ab.id, 250, 250, 200, 120, 0xff57a5e0));
ab.objects.push(...newParametricShape('star', ab.id, 120, 120, 100, 100, 0xffffcc00));
const bytes = exportRiv(doc);
writeFileSync('scripts/test-out.riv', bytes);
const back = importRiv(bytes);
const bytes2 = exportRiv(back);
console.log('bytes', bytes.length, bytes2.length, Buffer.from(bytes).equals(Buffer.from(bytes2)) ? 'IDENTICAL' : 'DIFF');
console.log(back.artboards[0].objects.map(o => o.type + ' ' + JSON.stringify(o.props)).join('\n'));
console.log(JSON.stringify(back.artboards[0].stateMachines[0], null, 0));

// every starter template must export, re-import and re-export identically
import { readFileSync as readFont } from 'fs';
import { TEMPLATES } from '../src/lib/rive/templates';
const font = { name: 'Inter', bytes: new Uint8Array(readFont('public/fonts/Inter-Regular.ttf')) };
for (const t of TEMPLATES) {
  const a = exportRiv(t.build(font));
  const b = exportRiv(importRiv(a));
  console.log(`template ${t.id}: ${a.length} bytes ${Buffer.from(a).equals(Buffer.from(b)) ? 'IDENTICAL' : 'DIFF'}`);
}
