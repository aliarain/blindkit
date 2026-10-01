// A real public GET through the shipped CLI and MCP protocol; no credentials or mutations.
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const directory = await mkdtemp(join(tmpdir(), 'blindkit-smoke-'));
const client = new Client(
  { name: 'blindkit-smoke', version: '1' },
  { versionNegotiation: { mode: 'legacy' } },
);
try {
  const config = join(directory, 'blindkit.json');
  await writeFile(
    config,
    JSON.stringify({
      sources: [{ name: 'posts', type: 'openapi', spec: resolve('examples/posts.openapi.json') }],
    }),
  );
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve('dist/cli.js'),
        'serve',
        '--config',
        config,
        '--audit',
        join(directory, 'audit.jsonl'),
      ],
      stderr: 'pipe',
    }),
  );
  const response = await client.callTool({
    name: 'execute',
    arguments: {
      code: 'const post = await tools.call("posts.getPost", {id: 1}); return {id: post.id, title: post.title};',
    },
  });
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.result.id, 1);
  console.log('Public API smoke passed:', result.result);
} finally {
  await client.close();
  await rm(directory, { recursive: true, force: true });
}
