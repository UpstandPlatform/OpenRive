// MCP (Model Context Protocol) server for OpenRive.
// Lets AI assistants (Claude Code, Claude Desktop, Cursor, ...) create and edit
// Rive files through the same document API the editor uses.
//
//   bun run mcp          (stdio transport)
//
// Changes are saved straight to the database; an open editor tab reloads them
// automatically.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as api from '@openrive/rive/api';
import { exportRiv, importRiv, type RiveDoc } from '@openrive/rive/document';
import { fromBase64, toBase64 } from '@openrive/shared/serialize';
import { MAX_RIV_BASE64_CHARS, type ProjectMeta } from '@openrive/shared';
import { env } from '@openrive/shared/env';
import { addTheme, applyTheme, setSwatchColor } from '@openrive/rive/theme';
import { createProject, deleteProject, edit, EXAMPLES, importFile, importBytes, loadDoc, loadFont, resolveProject, storage, TEMPLATES } from './project-store';

export interface McpServerOptions {
  /** User that owns newly created/imported projects for authenticated HTTP sessions. */
  ownerId?: string;
  /** Optional server-side project visibility/editing policy for HTTP sessions. */
  canSeeProject?: (project: ProjectMeta) => boolean;
  canEditProject?: (project: ProjectMeta) => boolean;
  canManageProject?: (project: ProjectMeta) => boolean;
  canCreateProjects?: boolean;
  /** Filesystem paths are intentionally disabled for remote HTTP MCP sessions. */
  allowFilePaths?: boolean;
  editorUrlBase?: string;
}

/** Creates a fresh MCP server for one transport/session. */
export function createMcpServer(options: McpServerOptions = {}) {
const server = new McpServer(
  { name: 'openrive', version: '1.0.0' },
  {
    instructions: [
      'Tools for creating and editing Rive (.riv) animation files stored by OpenRive.',
      'Workflow: list_projects or create_project, then get_project to see the structure (ids, names, timelines, state machines).',
      'Objects, artboards, timelines and state machines can be referenced by id or by name.',
      'Coordinates are in artboard pixels with (0,0) at the top-left; shapes are positioned by their center.',
      'Colors are CSS strings (#rrggbb or #rrggbbaa). Rotation uses rotationDegrees.',
      'Animate by adding a timeline, then add_keyframes (frame numbers at the timeline fps, or time in seconds).',
      'Interactivity: add_state_machine, add_property, add_state (one per timeline), add_transition (with conditions), add_listener (pointer events set properties).',
      'Use data binding properties (add_property), not state machine inputs: Rive deprecated inputs, and runtimes read and write properties without deprecation warnings.',
      'Files that still have inputs can be migrated in one step with convert_inputs_to_data_binding.',
      'Theme colors: define_theme_color once, use_theme_color on shapes/text; add_theme + switch_theme recolors everything.',
      'The user can open http://localhost:3000/editor/<id> to see results; edits appear live in an open editor.',
    ].join('\n'),
  },
);

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true });

function tool<S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown> | unknown) {
  server.registerTool(name, { description, inputSchema: shape }, (async (args: z.infer<z.ZodObject<S>>) => {
    try {
      return ok(await run(args));
    } catch (e) {
      return fail(e);
    }
  }) as never);
}

const project = z.string().describe('Project id or name');
const artboard = z.string().optional().describe('Artboard id or name (default: first artboard)');
const color = z.string().describe('CSS color, e.g. #ff5c7a or #00000080');
const url = (id: string) => `${(options.editorUrlBase ?? env().OPENRIVE_URL).replace(/\/$/, '')}/editor/${id}`;

async function authorized(ref: string, operation: 'read' | 'edit' | 'manage') {
  const meta = await resolveProject(ref);
  const allowed =
    operation === 'read'
      ? options.canSeeProject?.(meta) ?? true
      : operation === 'edit'
        ? options.canEditProject?.(meta) ?? true
        : options.canManageProject?.(meta) ?? true;
  if (!allowed) throw new Error('You do not have permission to use this project');
  return meta;
}

async function loadAuthorized(ref: string) {
  const meta = await authorized(ref, 'read');
  return loadDoc(meta.id);
}

async function editAuthorized<T>(ref: string, fn: (doc: RiveDoc) => T) {
  const meta = await authorized(ref, 'edit');
  return edit(meta.id, fn);
}

// ---------------------------------------------------------------------------
// Projects

tool('list_projects', 'List all local Rive projects.', {}, async () =>
  (await storage.listProjects()).filter((p) => options.canSeeProject?.(p) ?? true).map((p) => ({
    id: p.id,
    name: p.name,
    updated: new Date(p.updatedAt).toISOString(),
    artboards: p.artboards,
    timelines: p.animations,
    stateMachines: p.stateMachines,
  })),
);

tool('list_templates', 'List starter templates and example files that create_project can use.', {}, () => [
  ...TEMPLATES.map((t) => ({ id: t.id, name: t.name, description: t.description, teaches: t.learn })),
  ...EXAMPLES.map((e) => ({ id: e.id, name: e.name, description: e.description, teaches: e.learn, example: true })),
]);

tool(
  'create_project',
  'Create a new project, optionally from a template (see list_templates). Returns its id and editor URL.',
  { name: z.string(), template: z.string().optional().describe('Template id, default "blank"') },
  async ({ name, template }) => {
    if (options.canCreateProjects === false) throw new Error('You do not have permission to create projects');
    const meta = await createProject(name, template, options.ownerId);
    return { id: meta.id, name: meta.name, editor: url(meta.id) };
  },
);

tool('delete_project', 'Permanently delete a project from disk.', { project }, async ({ project: ref }) => {
  const meta = await authorized(ref, 'manage');
  await deleteProject(meta.id);
  return `Deleted ${meta.name} (${meta.id})`;
});

tool(
  'get_project',
  'Describe a project: artboards with their object tree (ids, names, positions, colors, text), timelines with keyed properties, state machines with inputs/states, and theme colors.',
  { project },
  async ({ project: ref }) => {
    const { meta, doc } = await loadAuthorized(ref);
    return { id: meta.id, name: meta.name, editor: url(meta.id), ...api.outline(doc) };
  },
);

tool(
  'import_riv',
  'Import a .riv file as a new project. Use dataBase64 for remote HTTP MCP sessions; path is available only to local stdio MCP.',
  { path: z.string().optional().describe('Absolute path to a .riv file (local stdio only)'), dataBase64: z.string().base64().max(MAX_RIV_BASE64_CHARS).optional().describe('Base64 encoded .riv bytes (for HTTP MCP)'), name: z.string().max(200).optional() },
  async ({ path: p, dataBase64, name }) => {
    if (!!p === !!dataBase64) throw new Error('Provide exactly one of path or dataBase64');
    if (p && !options.allowFilePaths) throw new Error('Filesystem paths are not available through HTTP MCP; send dataBase64');
    if (options.canCreateProjects === false) throw new Error('You do not have permission to create projects');
    const meta = p ? await importFile(p, name, options.ownerId) : await importBytes(fromBase64(dataBase64!), name, options.ownerId);
    return { id: meta.id, name: meta.name, editor: url(meta.id) };
  },
);

tool(
  'export_riv',
  'Export a project as a .riv file. Local stdio may provide path; HTTP MCP receives portable base64 bytes in the response.',
  { project, path: z.string().optional().describe('Output file path (.riv), local stdio only') },
  async ({ project: ref, path: out }) => {
    const { doc } = await loadAuthorized(ref);
    const bytes = exportRiv(doc);
    if (out) {
      if (!options.allowFilePaths) throw new Error('Filesystem paths are not available through HTTP MCP');
      writeFileSync(out, bytes);
      return `Wrote ${bytes.length} bytes to ${path.resolve(out)}`;
    }
    return { bytes: bytes.length, dataBase64: toBase64(bytes), filename: 'openrive.riv' };
  },
);

tool('inspect_riv', 'Describe a .riv file. Use dataBase64 for HTTP MCP; path is available only to local stdio MCP.', { path: z.string().optional(), dataBase64: z.string().base64().max(MAX_RIV_BASE64_CHARS).optional() }, ({ path: p, dataBase64 }) => {
  if (!!p === !!dataBase64) throw new Error('Provide exactly one of path or dataBase64');
  if (p && !options.allowFilePaths) throw new Error('Filesystem paths are not available through HTTP MCP; send dataBase64');
  return api.outline(importRiv(p ? new Uint8Array(readFileSync(p)) : fromBase64(dataBase64!)));
});

// ---------------------------------------------------------------------------
// Design

tool(
  'add_artboard',
  'Add an artboard to a project.',
  { project, name: z.string().optional(), width: z.number().default(500), height: z.number().default(500), background: color.optional() },
  async ({ project: ref, ...a }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addArtboard(doc, a));
    return { id: result.id, name: result.artboard.props.name };
  },
);

tool(
  'add_shape',
  'Add a shape (rectangle, ellipse, triangle, polygon, star) centered at x,y.',
  {
    project,
    artboard,
    parent: z.string().optional().describe('Group to nest in'),
    kind: z.enum(['rectangle', 'ellipse', 'triangle', 'polygon', 'star']),
    name: z.string().optional(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    fill: color.optional(),
    noFill: z.boolean().optional(),
    stroke: color.optional(),
    strokeWidth: z.number().optional(),
    cornerRadius: z.number().optional(),
    points: z.number().optional().describe('Polygon/star point count'),
    innerRadius: z.number().optional().describe('Star inner radius 0..1'),
    rotation: z.number().optional().describe('Degrees'),
  },
  async ({ project: ref, noFill, ...s }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addShape(doc, { ...s, fill: noFill ? null : s.fill }));
    return { id: result.id, name: result.props.name };
  },
);

tool(
  'add_path',
  'Add a custom vector path from points (relative to x,y). Points may have bezier handles inX/inY/outX/outY (offsets from the point).',
  {
    project,
    artboard,
    parent: z.string().optional(),
    name: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    points: z.array(z.object({ x: z.number(), y: z.number(), inX: z.number().optional(), inY: z.number().optional(), outX: z.number().optional(), outY: z.number().optional() })),
    closed: z.boolean().default(true),
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: z.number().optional(),
  },
  async ({ project: ref, ...p }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addPath(doc, p));
    return { id: result.id, name: result.props.name };
  },
);

tool(
  'add_text',
  'Add a text object (the Inter font is embedded automatically).',
  {
    project,
    artboard,
    parent: z.string().optional(),
    text: z.string(),
    x: z.number(),
    y: z.number(),
    fontSize: z.number().optional(),
    color: color.optional(),
    name: z.string().optional(),
    width: z.number().optional().describe('Wrap width; omit for auto width'),
    align: z.enum(['left', 'center', 'right']).optional(),
    origin: z.enum(['topLeft', 'center']).optional().describe('What x,y refers to'),
    bold: z.boolean().optional(),
  },
  async ({ project: ref, bold, ...t }) => {
    const font = loadFont(bold ? 'Inter Bold' : 'Inter');
    const { result } = await editAuthorized(ref, (doc) => api.addText(doc, { ...t, font }));
    return { id: result.id, name: result.props.name };
  },
);

tool(
  'add_group',
  'Add an empty group (Node) that other objects can be nested in via their parent.',
  { project, artboard, parent: z.string().optional(), name: z.string().optional(), x: z.number().optional(), y: z.number().optional() },
  async ({ project: ref, ...g }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addGroup(doc, g));
    return { id: result.id, name: result.props.name };
  },
);

tool(
  'set_properties',
  'Set design properties on an object, e.g. {"x":10,"opacity":0.5,"rotationDegrees":45,"fill":"#ff0000","text":"Hi","fontSize":24,"width":100}.',
  { project, object: z.string().describe('Object id or name'), properties: z.record(z.string(), z.unknown()) },
  async ({ project: ref, object, properties }) => {
    await editAuthorized(ref, (doc) => api.setProperties(doc, object, properties));
    return 'ok';
  },
);

tool('delete_objects', 'Delete objects (and their children and keyframes).', { project, objects: z.array(z.string()) }, async ({ project: ref, objects }) => {
  await editAuthorized(ref, (doc) => api.deleteObjectsByRef(doc, objects));
  return `Deleted ${objects.length} object(s)`;
});

// ---------------------------------------------------------------------------
// Animation

tool(
  'add_timeline',
  'Add a timeline (linear animation) to an artboard.',
  {
    project,
    artboard,
    name: z.string(),
    duration: z.number().optional().describe('Seconds (default 1)'),
    fps: z.number().optional(),
    loop: z.enum(['oneShot', 'loop', 'pingPong']).optional(),
    speed: z.number().optional(),
  },
  async ({ project: ref, ...a }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addAnimation(doc, a));
    return { id: result.id, name: result.props.name };
  },
);

const ease = z
  .union([z.enum(['hold', 'linear', 'easeInOut', 'easeIn', 'easeOut', 'easeOutBack', 'easeInBack']), z.tuple([z.number(), z.number(), z.number(), z.number()])])
  .optional()
  .describe('Interpolation to the next key (default easeInOut) or a cubic bezier [x1,y1,x2,y2]');

tool(
  'add_keyframes',
  'Key one property of an object in a timeline. Properties: x, y, rotationDegrees, scaleX, scaleY, opacity, width, height, fill, stroke, fontSize, cornerRadiusTL, ... Values for fill/stroke are colors.',
  {
    project,
    artboard,
    timeline: z.string(),
    object: z.string(),
    property: z.string(),
    keys: z.array(
      z.object({
        frame: z.number().optional(),
        time: z.number().optional().describe('Seconds (instead of frame)'),
        value: z.union([z.number(), z.string(), z.boolean()]).optional(),
        themeColor: z.string().optional().describe('Use a theme color for color properties'),
        ease,
      }),
    ),
  },
  async ({ project: ref, timeline, ...k }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addKeyframes(doc, { ...k, animation: timeline }));
    return `Added ${result.length} keyframe(s)`;
  },
);

// ---------------------------------------------------------------------------
// State machines

const sm = z.string().optional().describe('State machine id or name (default: first)');

tool('add_state_machine', 'Add a state machine (with entry / any / exit states).', { project, artboard, name: z.string() }, async ({ project: ref, ...s }) => {
  const { result } = await editAuthorized(ref, (doc) => api.addStateMachine(doc, s));
  return { id: result.id, name: result.props.name };
});

tool(
  'add_input',
  'DEPRECATED: add a state machine input. Rive deprecated inputs — prefer add_property, which works everywhere inputs did and more. Only use this for a file that must keep its existing inputs.',
  { project, artboard, stateMachine: sm, type: z.enum(['number', 'boolean', 'trigger']), name: z.string(), value: z.union([z.number(), z.boolean()]).optional() },
  async ({ project: ref, ...i }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addInput(doc, i));
    return { id: result.id, name: result.props.name };
  },
);

tool(
  'add_property',
  'Add a data binding property to the artboard (what replaces state machine inputs). Transitions can read it, listeners can set it, and runtimes get and set it on the view model instance.',
  {
    project,
    artboard,
    type: z.enum(['number', 'boolean', 'trigger', 'string', 'color']),
    name: z.string(),
    value: z.union([z.number(), z.boolean(), z.string()]).optional().describe('Starting value; colors take #rrggbb'),
  },
  async ({ project: ref, ...p }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addDataProperty(doc, { ...p, value: p.type === 'color' && typeof p.value === 'string' ? api.parseColor(p.value) : p.value }));
    return { id: result.obj.id, name: result.name, type: result.type };
  },
);

tool(
  'set_property_value',
  'Set the value a data binding property starts with.',
  { project, artboard, property: z.string(), value: z.union([z.number(), z.boolean(), z.string()]) },
  async ({ project: ref, ...p }) => {
    await editAuthorized(ref, (doc) => api.setDataProperty(doc, { ...p, value: typeof p.value === 'string' && /^#[0-9a-f]{3,8}$/i.test(p.value) ? api.parseColor(p.value) : p.value }));
    return 'ok';
  },
);

tool(
  'convert_inputs_to_data_binding',
  'Rewrite a file\'s deprecated state machine inputs as data binding properties: conditions read the property, listeners set it, and the inputs are removed. Reports anything that had to keep its input.',
  { project, artboard, stateMachine: sm },
  async ({ project: ref, ...o }) => {
    const { result } = await editAuthorized(ref, (doc) => api.convertInputs(doc, o));
    return result;
  },
);

tool(
  'add_state',
  'Add a state that plays a timeline.',
  { project, artboard, stateMachine: sm, timeline: z.string(), layer: z.string().optional() },
  async ({ project: ref, timeline, ...s }) => {
    const { result } = await editAuthorized(ref, (doc) => api.addState(doc, { ...s, animation: timeline }));
    return { id: result.id };
  },
);

tool(
  'add_transition',
  'Add a transition between states. from/to: "entry", "any", "exit", a state id, or a timeline name. Conditions compare data binding properties (booleans use value, numbers use op + value, triggers need only the name).',
  {
    project,
    artboard,
    stateMachine: sm,
    layer: z.string().optional(),
    from: z.string(),
    to: z.string(),
    durationMs: z.number().optional().describe('Blend duration'),
    exitTimeMs: z.number().optional().describe('Wait until this time in the source timeline'),
    conditions: z
      .array(
        z.object({
          property: z.string().optional().describe('Data binding property to read (preferred)'),
          input: z.string().optional().describe('Deprecated state machine input; a property of the same name is used when there is no such input'),
          op: z.enum(['==', '!=', '<', '<=', '>', '>=']).optional(),
          value: z.union([z.number(), z.boolean(), z.string()]).optional(),
        }),
      )
      .optional(),
  },
  async ({ project: ref, ...t }) => {
    await editAuthorized(ref, (doc) => api.addTransition(doc, t));
    return 'ok';
  },
);

tool(
  'add_listener',
  'Make an object interactive: on a pointer event, set data binding properties (or, for older files, state machine inputs, whose boolean values can also be "toggle").',
  {
    project,
    artboard,
    stateMachine: sm,
    target: z.string().optional().describe('Object id or name (default: whole artboard)'),
    event: z.enum(['down', 'up', 'click', 'enter', 'exit', 'move']),
    name: z.string().optional(),
    actions: z.array(
      z.object({
        property: z.string().optional().describe('Data binding property to set (preferred)'),
        input: z.string().optional().describe('Deprecated state machine input; a property of the same name is used when there is no such input'),
        value: z.union([z.number(), z.boolean(), z.string()]).optional().describe('Triggers need no value; "toggle" only works with an input'),
      }),
    ),
  },
  async ({ project: ref, ...l }) => {
    const actions = l.actions.map((a) => {
      if (a.property) return { property: a.property, value: a.value };
      if (!a.input) throw new Error('Each action needs a property (or an input) to set');
      return { input: a.input, value: a.value as number | boolean | 'toggle' | undefined };
    });
    await editAuthorized(ref, (doc) => api.addListener(doc, { ...l, actions }));
    return 'ok';
  },
);

// ---------------------------------------------------------------------------
// Theme colors

tool('define_theme_color', 'Define (or update in the active theme) a named theme color.', { project, name: z.string(), color }, async ({ project: ref, name, color: c }) => {
  await editAuthorized(ref, (doc) => api.defineColor(doc, name, c));
  return 'ok';
});

tool(
  'use_theme_color',
  'Bind an object\'s fill or stroke (or a text color) to a theme color so it follows theme changes.',
  { project, object: z.string(), color: z.string().describe('Theme color name'), kind: z.enum(['Fill', 'Stroke']).optional() },
  async ({ project: ref, object, color: c, kind }) => {
    await editAuthorized(ref, (doc) => api.applyThemeColor(doc, object, c, kind));
    return 'ok';
  },
);

tool('add_theme', 'Add a theme (a copy of the active one) whose colors can then be changed.', { project, name: z.string() }, async ({ project: ref, name }) => {
  const { result } = await editAuthorized(ref, (doc) => addTheme(doc, name));
  return { id: result.id, name: result.name };
});

tool(
  'set_theme_color_value',
  'Change a theme color\'s value within a specific theme.',
  { project, theme: z.string().describe('Theme name or id'), name: z.string().describe('Theme color name'), color },
  async ({ project: ref, theme, name, color: c }) => {
    await editAuthorized(ref, (doc) => {
      const t = doc.editor?.themes.find((x) => x.id === theme || x.name === theme);
      const sw = doc.editor?.swatches.find((x) => x.id === name || x.name === name);
      if (!t || !sw) throw new Error('Theme or color not found');
      setSwatchColor(doc, sw.id, api.parseColor(c), t.id);
    });
    return 'ok';
  },
);

tool('switch_theme', 'Make a theme active, recoloring every bound color.', { project, theme: z.string() }, async ({ project: ref, theme }) => {
  await editAuthorized(ref, (doc) => {
    const t = doc.editor?.themes.find((x) => x.id === theme || x.name === theme);
    if (!t) throw new Error(`Theme "${theme}" not found`);
    applyTheme(doc, t.id);
  });
  return 'ok';
});

return server;
}

async function main() {
  await createMcpServer({ allowFilePaths: true }).connect(new StdioServerTransport());
  // stdout is the protocol channel; log to stderr only
  console.error('OpenRive MCP server running');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
