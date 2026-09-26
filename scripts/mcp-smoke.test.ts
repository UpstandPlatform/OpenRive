// End-to-end check of the MCP server over stdio using the official client.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'fs';
import { importRiv } from '@openrive/rive/document';

(async () => {
  const transport = new StdioClientTransport({
    command: 'bun',
    args: ['apps/cli/src/mcp-server.ts'],
    env: { ...process.env, OPENRIVE_DATA_DIR: process.env.OPENRIVE_DATA_DIR ?? './data' } as Record<string, string>,
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  await client.connect(transport);
  const tools = await client.listTools();
  console.log('tools:', tools.tools.length, tools.tools.map((t) => t.name).join(', '));
  const call = async (name: string, args: Record<string, unknown>) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
    return r.content[0].text;
  };
  const created = JSON.parse(await call('create_project', { name: 'MCP Smoke Test' }));
  const p = created.id;
  await call('define_theme_color', { project: p, name: 'Brand', color: '#7c5cff' });
  await call('add_shape', { project: p, kind: 'ellipse', name: 'Dot', x: 250, y: 250, width: 120, height: 120 });
  await call('use_theme_color', { project: p, object: 'Dot', color: 'Brand' });
  await call('add_text', { project: p, text: 'Made by MCP', x: 250, y: 400, origin: 'center', fontSize: 28, color: '#ffffff' });
  await call('add_timeline', { project: p, name: 'Pulse', duration: 1, loop: 'pingPong' });
  await call('add_keyframes', { project: p, timeline: 'Pulse', object: 'Dot', property: 'scaleX', keys: [{ time: 0, value: 1 }, { time: 1, value: 1.4 }] });
  await call('add_keyframes', { project: p, timeline: 'Pulse', object: 'Dot', property: 'scaleY', keys: [{ time: 0, value: 1 }, { time: 1, value: 1.4 }] });
  await call('add_state_machine', { project: p, name: 'Interact' });
  await call('add_input', { project: p, stateMachine: 'Interact', type: 'boolean', name: 'on' });
  await call('add_state', { project: p, stateMachine: 'Interact', timeline: 'Pulse' });
  await call('add_transition', { project: p, stateMachine: 'Interact', from: 'entry', to: 'Pulse' });
  await call('add_listener', { project: p, stateMachine: 'Interact', target: 'Dot', event: 'click', actions: [{ input: 'on', value: 'toggle' }] });

  // data binding: the properties that replace state machine inputs
  await call('add_property', { project: p, type: 'boolean', name: 'isHover' });
  await call('add_property', { project: p, type: 'number', name: 'level', value: 2 });
  await call('add_property', { project: p, type: 'trigger', name: 'ping' });
  await call('add_property', { project: p, type: 'color', name: 'tint', value: '#ff7a2b' });
  await call('set_property_value', { project: p, property: 'level', value: 5 });
  await call('add_transition', { project: p, stateMachine: 'Interact', from: 'Pulse', to: 'exit', conditions: [{ property: 'isHover', value: true }, { property: 'level', op: '>', value: 3 }] });
  await call('add_listener', { project: p, stateMachine: 'Interact', target: 'Dot', event: 'enter', actions: [{ property: 'isHover', value: true }] });
  const converted = JSON.parse(await call('convert_inputs_to_data_binding', { project: p }));
  console.log('converted inputs:', JSON.stringify(converted));
  await call('add_theme', { project: p, name: 'Warm' });
  await call('set_theme_color_value', { project: p, theme: 'Warm', name: 'Brand', color: '#ff7a2b' });
  await call('switch_theme', { project: p, theme: 'Warm' });
  const outline = JSON.parse(await call('get_project', { project: p }));
  console.log('properties:', JSON.stringify(outline.artboards[0].properties));
  console.log('inputs left:', JSON.stringify(outline.artboards[0].stateMachines.map((m: { name: string; inputs: unknown[] }) => `${m.name}:${m.inputs.length}`)));
  console.log('outline:', JSON.stringify(outline.artboards[0].children), JSON.stringify(outline.themeColors));
  const out = 'scripts/mcp-smoke.riv';
  console.log(await call('export_riv', { project: p, path: out }));
  const back = importRiv(new Uint8Array(readFileSync(out)));
  console.log('re-import ok:', back.artboards[0].objects.length, 'objects,', back.artboards[0].stateMachines.length, 'state machines');
  await call('delete_project', { project: p });
  await client.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
