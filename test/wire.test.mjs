import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fixture } from './fixture.mjs';

// Intentionally does not use the MCP client SDK: verify JSON-RPC on the wire.
async function wire(t, fixture, protocolVersion = '2025-11-25') {
  const config = join(fixture.directory, 'wire.json');
  await writeFile(config, JSON.stringify(fixture.config));
  const child = spawn(
    process.execPath,
    [resolve('dist/cli.js'), 'serve', '--config', config, '--audit', fixture.auditPath],
    {
      env: { PATH: process.env.PATH, TEST_KEY: 's3cr3t-test-value' },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const exited = once(child, 'exit');
  const pending = new Map();
  const requests = [];
  let nextId = 0;
  let onRequest = (request) => requests.push(request);
  let stderr = '';
  child.stderr.on('data', (data) => {
    stderr += data;
  });
  const send = (message) =>
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    if (message.method) {
      onRequest(message);
    } else {
      const response = pending.get(message.id);
      if (response) {
        clearTimeout(response.timer);
        pending.delete(message.id);
        response.resolve(message);
      }
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(
        () => reject(new Error(`No response to ${method}: ${stderr}`)),
        5000,
      );
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  t.after(async () => {
    for (const response of pending.values()) {
      clearTimeout(response.timer);
      response.reject(new Error('Client closed'));
    }
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
  });
  const initialized = await request('initialize', {
    protocolVersion,
    capabilities: { elicitation: { form: {} } },
    clientInfo: { name: 'wire-test', version: '1' },
  });
  assert.equal(initialized.result.protocolVersion, protocolVersion);
  send({ method: 'notifications/initialized' });
  return {
    child,
    exited,
    send,
    request,
    requests,
    handleRequests(handler) {
      onRequest = handler;
    },
  };
}

for (const protocol of ['2025-03-26', '2025-06-18', '2025-11-25']) {
  test(`raw MCP ${protocol} handshake, discovery, read and malformed input`, async (t) => {
    const f = await fixture(t);
    const client = await wire(t, f, protocol);
    const list = await client.request('tools/list', {});
    assert.equal(list.result.tools.length, 2);
    const read = await client.request('tools/call', {
      name: 'execute',
      arguments: { code: 'return (await tools.call("demo.getItem", {id:"7"})).id;' },
    });
    assert.equal(JSON.parse(read.result.content[0].text).result, 7);
    const invalid = await client.request('tools/call', {
      name: 'execute',
      arguments: { code: 42 },
    });
    assert.ok(invalid.error || invalid.result.isError);
    assert.equal(f.calls.length, 1);
    assert.deepEqual((await client.request('ping', {})).result, {});
  });
}

test('raw form approval is enforced before HTTP dispatch', async (t) => {
  const f = await fixture(t);
  const client = await wire(t, f);
  let prompts = 0;
  client.handleRequests((request) => {
    assert.equal(request.method, 'elicitation/create');
    assert.equal(f.calls.length, 0);
    prompts++;
    client.send({
      id: request.id,
      result: { action: 'accept', content: { confirm: prompts === 2 } },
    });
  });
  const params = {
    name: 'execute',
    arguments: { code: 'return await tools.call("demo.createItem", {body:{name:"Ada"}});' },
  };
  assert.equal(
    JSON.parse((await client.request('tools/call', params)).result.content[0].text).ok,
    false,
  );
  assert.equal(
    JSON.parse((await client.request('tools/call', params)).result.content[0].text).ok,
    true,
  );
  assert.equal(prompts, 2);
  assert.equal(f.calls.length, 1);
});

test('client disconnect aborts a pending approval and server exits promptly', async (t) => {
  const f = await fixture(t);
  const client = await wire(t, f);
  const elicited = new Promise((resolve) => client.handleRequests(resolve));
  client.send({
    id: 99,
    method: 'tools/call',
    params: {
      name: 'execute',
      arguments: { code: 'return await tools.call("demo.createItem", {body:{name:"Ada"}});' },
    },
  });
  await elicited;
  client.child.stdin.end();
  let timeout;
  try {
    const [code] = await Promise.race([
      client.exited,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Server stayed alive after disconnect')), 3000);
      }),
    ]);
    assert.equal(code, 0);
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.parse((await readFile(f.auditPath, 'utf8')).trim()).status, 'blocked');
});
