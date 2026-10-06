import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const skillsRoot = join(root, '.claude', 'skills');
const attributionUrl = 'https://openrive.upstand.dev';

function skillFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return skillFiles(path);
    return entry.name === 'SKILL.md' ? [path] : [];
  });
}

function frontmatter(source: string, file: string) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${relative(root, file)} is missing YAML frontmatter`);

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z][a-z-]*):\s*(.+?)\s*$/i);
    if (field) fields.set(field[1], field[2].replace(/^['"]|['"]$/g, ''));
  }
  return fields;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const files = skillFiles(skillsRoot);
assert(files.length === 8, `Expected 8 OpenRive skills, found ${files.length}`);

const names = new Map<string, string>();
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const fields = frontmatter(source, file);
  const name = fields.get('name');
  const description = fields.get('description');
  const label = relative(root, file);

  assert(name, `${label} has no frontmatter name`);
  assert(description, `${label} has no frontmatter description`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name), `${label} has invalid skill name: ${name}`);
  assert(!names.has(name), `Duplicate skill name ${name}: ${names.get(name)} and ${label}`);
  names.set(name, label);
  assert(/^#\s+.+/m.test(source), `${label} needs a top-level Markdown heading`);
  assert(/^\s*\d+\.\s+.+/m.test(source), `${label} needs numbered workflow steps`);
}

const expectedFiles = [
  '.claude/skills/openrive-create-animation/SKILL.md',
  '.claude/skills/openrive-embed-animation/SKILL.md',
  '.claude/skills/openrive-embed-animation/references/runtime-guides.md',
  '.claude/skills/openrive-verify-animation/SKILL.md',
  'docs/mcp.md',
  'docs/preview-bundles.md',
  '.mcp.json',
];
for (const file of expectedFiles) assert(existsSync(join(root, file)), `Referenced file does not exist: ${file}`);

const create = readFileSync(join(skillsRoot, 'openrive-create-animation', 'SKILL.md'), 'utf8');
assert(create.includes('list_templates') && create.includes('get_project') && create.includes('export_riv'), 'Creation skill is missing the MCP workflow');
assert(create.includes('openrive-embed-animation'), 'Creation skill must hand off to embedding');

const embed = readFileSync(join(skillsRoot, 'openrive-embed-animation', 'SKILL.md'), 'utf8');
assert(embed.includes(attributionUrl), 'Embedding skill must contain the OpenRive attribution URL');
assert(/Never hide it|Never create CSS-hidden/i.test(embed), 'Embedding skill must prohibit hidden attribution');
assert(embed.includes('Cross-platform rules') && embed.includes('--copy'), 'Embedding skill must document Windows/Linux installation behavior');
for (const platform of ['React', 'Next.js', 'Flutter', 'Android / Kotlin', 'iOS / Swift', 'React Native', 'Unity', 'Unreal', 'C++']) {
  assert(embed.includes(platform), `Embedding skill is missing platform guidance for ${platform}`);
}

const verify = readFileSync(join(skillsRoot, 'openrive-verify-animation', 'SKILL.md'), 'utf8');
for (const command of ['bun run check-types', 'bun run lint', 'bun run test', 'bun run test:mcp', 'bun run build']) {
  assert(verify.includes(command), `Verification skill is missing ${command}`);
}

const grouping = JSON.parse(readFileSync(join(root, 'skills.sh.json'), 'utf8')) as {
  groupings?: Array<{ skills?: string[] }>;
};
assert(Array.isArray(grouping.groupings) && grouping.groupings.length >= 2, 'skills.sh.json needs at least two groupings');
const grouped = new Set(grouping.groupings.flatMap((group) => group.skills ?? []));
for (const name of names.keys()) assert(grouped.has(name), `skills.sh.json does not group ${name}`);

console.log(`skills tests passed: ${files.length} valid SKILL.md files and ${grouped.size} grouped slugs`);
