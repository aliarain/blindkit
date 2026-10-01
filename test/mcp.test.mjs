import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fixture } from './fixture.mjs';

const cli = resolve('dist/cli.js');
const run = promisify(execFile);
async function connect(t, f, supportsApproval = true) {
  const config = join(f.directory, 'blindkit.json');
  await writeFile(config, JSON.stringify(f.config));
  const client = new Client(
    { name: 'blindkit-test', version: '1' },
    {
      versionNegotiation: { mode: 'legacy' },
      capabilities: supportsApproval ? { elicitation: { form: {} } } : {},
    },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'serve', '--config', config, '--audit', f.auditPath],
    env: { TEST_KEY: 's3cr3t-test-value' },
    stderr: 'pipe',
  });
  t.after(() => client.close());
  await client.connect(transport);
  return client;
}
const value = (response) => JSON.parse(response.content[0].text);

test('stdio MCP advertises only search/execute and performs a read', async (t) => {
  const f = await fixture(t);
  const client = await connect(t, f);
  assert.deepEqual((await client.listTools()).tools.map((t) => t.name).sort(), [
    'execute',
    'search',
  ]);
  const found = value(await client.callTool({ name: 'search', arguments: { query: 'getItem' } }));
  assert.equal(found[0].decision, 'allow');
  const result = value(
    await client.callTool({
      name: 'execute',
      arguments: { code: 'return (await tools.call("demo.getItem", {id: "7"})).name;' },
    }),
  );
  assert.deepEqual(result, { ok: true, result: 'Ada', logs: [] });
});

test('stdio requires accepted confirmation and cannot accept an agent approval field', async (t) => {
  const f = await fixture(t);
  const client = await connect(t, f);
  let answer = { action: 'decline' };
  const prompts = [];
  client.setRequestHandler('elicitation/create', async (request) => {
    prompts.push(request.params);
    return answer;
  });
  const code = 'return await tools.call("demo.createItem", {body: {name: "Ada"}});';
  const forged = await client.callTool({
    name: 'execute',
    arguments: { code, approve: ['demo.createItem'] },
  });
  assert.equal(forged.isError, true);
  assert.equal(prompts.length, 0);
  for (const response of [
    { action: 'decline' },
    { action: 'cancel' },
    { action: 'accept', content: { confirm: false } },
  ]) {
    answer = response;
    assert.equal(value(await client.callTool({ name: 'execute', arguments: { code } })).ok, false);
  }
  assert.equal(f.calls.length, 0);
  answer = { action: 'accept', content: { confirm: true } };
  assert.equal(value(await client.callTool({ name: 'execute', arguments: { code } })).ok, true);
  assert.equal(f.calls.length, 1);
  assert.match(prompts.at(-1).message, /POST.*\/items/);
  assert.match(prompts.at(-1).message, /Ada/);
  assert.equal(prompts.at(-1).requestedSchema.properties.confirm.default, false);
});

test('MCP clients without elicitation cannot mutate', async (t) => {
  const f = await fixture(t);
  const client = await connect(t, f, false);
  const result = value(
    await client.callTool({
      name: 'execute',
      arguments: { code: 'return await tools.call("demo.createItem", {body: {name: "Ada"}});' },
    }),
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /approval/);
  assert.equal(f.calls.length, 0);
});

test('CLI init/add is usable, refuses overwrites and leaves valid config on failure', async (t) => {
  const f = await fixture(t);
  const config = join(f.directory, 'cli.json');
  await run(process.execPath, [cli, 'init', '--config', config]);
  await assert.rejects(run(process.execPath, [cli, 'init', '--config', config]));
  await run(process.execPath, [cli, 'add', f.specPath, '--name', 'demo', '--config', config]);
  const before = await readFile(config, 'utf8');
  assert.equal(JSON.parse(before).sources[0].name, 'demo');
  await assert.rejects(
    run(process.execPath, [cli, 'add', f.specPath, '--name', 'demo', '--config', config]),
  );
  assert.equal(await readFile(config, 'utf8'), before);
});
