import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'openrive-mcp-bridge-data-'));
const portProbe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
const base = `http://127.0.0.1:${portProbe.port}`;
portProbe.stop(true);

const transport = new StdioClientTransport({
  command: 'bun',
  args: ['apps/cli/src/index.ts', 'mcp'],
  env: {
    ...process.env,
    OPENRIVE_DATA_DIR: dataDir,
    OPENRIVE_URL: base,
    OPENRIVE_AUTH: 'off',
  } as Record<string, string>,
});
const client = new Client({ name: 'bridge-smoke', version: '1.0.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'create_project'), 'the bridge should forward MCP tools');
  const created = await client.callTool({ name: 'create_project', arguments: { name: 'Bridge Smoke Test' } });
  assert.notEqual(created.isError, true, 'the bridge should forward tool calls to the local server');
  await client.close();
  let stopped = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(200) });
    } catch {
      stopped = true;
      break;
    }
    await Bun.sleep(200);
  }
  assert.ok(stopped, 'the bridge should stop the server it started when the MCP client disconnects');
  console.log('MCP bridge ok');
} finally {
  await client.close().catch(() => {});
  rmSync(dataDir, { recursive: true, force: true });
}
