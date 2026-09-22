// Regenerates packages/rive/src/core-defs.json from a checkout of rive-runtime:
//   git clone --depth 1 https://github.com/rive-app/rive-runtime
//   bun scripts/generate-core-defs.js ../rive-runtime
// Every Rive object type, its typeKey, parent type and properties (key,
// backing type, default, runtime vs editor-only) come from the generated
// C++ headers, so the editor always matches the official file format.
const fs = require('fs');
const path = require('path');
const runtimeDir = process.argv[2];
if (!runtimeDir) {
  console.error('usage: bun scripts/generate-core-defs.js <path-to-rive-runtime>');
  process.exit(1);
}
const root = path.join(runtimeDir, 'include', 'rive', 'generated');
const out = path.join(__dirname, '..', 'packages', 'rive', 'src', 'core-defs.json');

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (f.endsWith('_base.hpp')) acc.push(p);
  }
  return acc;
}

const registry = fs.readFileSync(path.join(root, 'core_registry.hpp'), 'utf8');
// map "ClassBase::nameKey" -> field type via set* functions
const fieldTypeOf = {};
const setFns = ['Id', 'String', 'Uint', 'Color', 'Bool', 'Double', 'Callback', 'Int'];
for (const fn of setFns) {
  const re = new RegExp(`static void set${fn}\\(Core\\* object, int propertyKey[^)]*\\)\\s*\\{([\\s\\S]*?)\\n    \\}`, 'm');
  const m = registry.match(re);
  if (!m) { console.error('no set fn', fn); continue; }
  for (const c of m[1].matchAll(/case\s+(\w+)Base::\s*(\w+)PropertyKey/g)) {
    const k = `${c[1]}.${c[2]}`; if (!fieldTypeOf[k]) fieldTypeOf[k] = fn.toLowerCase();
  }
}
// bytes: from propertyFieldId section returning CoreBytesType
{
  const m = registry.match(/static int propertyFieldId\(int propertyKey\)\s*\{([\s\S]*?)\n    \}/);
  const body = m[1];
  const blocks = body.split(/return\s+(\w+)::id;/);
  // blocks: [cases, type, cases, type ...]
  for (let i = 0; i + 1 < blocks.length; i += 2) {
    const t = blocks[i + 1];
    if (t === 'CoreBytesType') {
      for (const c of blocks[i].matchAll(/case\s+(\w+)Base::\s*(\w+)PropertyKey/g)) {
        fieldTypeOf[`${c[1]}.${c[2]}`] = 'bytes';
      }
    }
  }
}

function parseDefault(raw, type) {
  if (raw == null) return undefined;
  raw = raw.trim();
  if (type === 'string') { const m = raw.match(/^"(.*)"$/); return m ? m[1] : ''; }
  if (type === 'bool') return raw === 'true';
  if (type === 'double') { const v = parseFloat(raw.replace(/f$/, '')); return isNaN(v) ? 0 : v; }
  if (type === 'color') { const v = Number(raw); return isNaN(v) ? 0 : (v >>> 0); }
  if (raw === 'Core::emptyId' || raw.includes('missingId') || raw === '-1') return type === 'int' ? -1 : -1;
  const v = Number(raw.replace(/[uU]$/, ''));
  return isNaN(v) ? 0 : v;
}

const types = {};
for (const file of walk(root)) {
  const src = fs.readFileSync(file, 'utf8');
  const cm = src.match(/class\s+(\w+)Base\s*:\s*public\s+(\w+)/);
  if (!cm) continue;
  const name = cm[1];
  const sup = src.match(/typedef\s+(\w+)\s+Super;/);
  const tk = src.match(/static const uint16_t typeKey = (\d+);/);
  if (!tk) continue;
  const dser = (src.match(/bool deserialize\(uint16_t propertyKey, BinaryReader& reader\) override\s*\{([\s\S]*?)\n    \}/) || [,''])[1];
  const props = [];
  for (const pm of src.matchAll(/static const uint16_t (\w+)PropertyKey = (\d+);/g)) {
    const pname = pm[1];
    const key = +pm[2];
    const ft = fieldTypeOf[`${name}.${pname}`] || 'unknown';
    const capital = pname[0].toUpperCase() + pname.slice(1);
    let def;
    const dm = src.match(new RegExp(`\\s(?:[\\w:<>]+)\\s+m_${capital}\\s*=\\s*([^;]+);`));
    if (dm) def = dm[1];
    else {
      const sm = src.match(new RegExp(`\\n\\s+[\\w:]+\\s+${pname}\\s*=\\s*([^;]+);`));
      if (sm) def = sm[1];
    }
    const runtime = new RegExp(`case\\s+${pname}PropertyKey\\s*:`).test(dser);
    props.push({ name: pname, key, type: ft, default: parseDefault(def, ft), runtime });
  }
  types[name] = { name, typeKey: +tk[1], parent: sup && sup[1] !== 'Core' ? sup[1] : null, props };
}
// types the runtime can instantiate (others become null objects when read)
const mk = registry.match(/static Core\* makeCoreInstance\(int typeKey\)\s*\{([\s\S]*?)\n    \}/)[1];
const instantiable = new Set([...mk.matchAll(/case\s+(\w+)Base::typeKey/g)].map((m) => m[1]));
for (const t of Object.values(types)) t.instantiable = instantiable.has(t.name);
const list = Object.values(types).sort((a, b) => a.typeKey - b.typeKey);
const compact = list.map((t) => [
  t.name,
  t.typeKey,
  t.parent,
  t.props.map((p) => [p.name, p.key, p.type, p.default === undefined ? null : p.default, p.runtime ? 1 : 0]),
  t.instantiable ? 1 : 0,
]);
fs.writeFileSync(out, JSON.stringify(compact));
console.log('types', list.length, 'unknown field types:',
  list.flatMap(t => t.props.filter(p => p.type === 'unknown').map(p => t.name + '.' + p.name)).join(', '));
