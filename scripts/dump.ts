import { readFileSync } from 'fs';
import { readRiv, typeNameOf } from '@openrive/rive/riv-format';
import { propDefByKey } from '@openrive/rive/schema';
const raw = readRiv(new Uint8Array(readFileSync(process.argv[2])));
const from = Number(process.argv[3] ?? 0), to = Number(process.argv[4] ?? 60);
raw.objects.slice(from, to).forEach((o, i) =>
  console.log(from + i, typeNameOf(o.typeKey) ?? '#' + o.typeKey, o.props.map((p) => `${propDefByKey(p.key)?.name ?? p.key}=${p.value instanceof Uint8Array ? `<${p.value.length} bytes>` : JSON.stringify(p.value)}`).join(' ')),
);
