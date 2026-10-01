import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { Registry } from '../dist/registry.js';
import { Gateway } from '../dist/gateway.js';
import { bounded } from '../dist/http.js';

test('search returns schemas and ranks operation names', async (t) => {
  const { registry } = await fixture(t);
  assert.equal(registry.search('getItem')[0].path, 'demo.getItem');
  assert.deepEqual(registry.search('unrelated'), []);
  assert.deepEqual(registry.search('createItem')[0].inputSchema.required, ['body']);
});

test('sandbox exposes no ambient authority and executes plain JS', async (t) => {
  const { gateway } = await fixture(t);
  const result = await gateway.execute(
    'console.log("hello"); return [typeof process, typeof require, typeof fetch, typeof Worker, 6 * 7];',
  );
  assert.deepEqual(result, {
    ok: true,
    result: ['undefined', 'undefined', 'undefined', 'undefined', 42],
    logs: ['hello'],
  });
});

test('secrets are host-only, echoed values and sensitive keys are redacted before guest code runs', async (t) => {
  const { gateway, calls, auditPath } = await fixture(t);
  const result = await gateway.execute(
    'const x = await tools.call("demo.getItem", {id: "7", tags: ["a", "b"]}); console.log(x.echoed); return x;',
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(calls[0].headers.authorization, 'Bearer s3cr3t-test-value');
  assert.equal(calls[0].url, '/items/7?tags=a&tags=b');
  assert.equal(result.result.echoed, 'Bearer [REDACTED]');
  assert.equal(result.result.token, '[REDACTED]');
  const audit = await readFile(auditPath, 'utf8');
  assert.equal(audit.includes('s3cr3t-test-value'), false);
  assert.equal(audit.includes('other-api-secret'), false);
  assert.deepEqual(
    audit
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).status),
    ['started', 'succeeded'],
  );
  assert.equal((await stat(auditPath)).mode & 0o777, 0o600);
});

test('mutation is denied without human approval and audited', async (t) => {
  const { gateway, calls, auditPath } = await fixture(t);
  const result = await gateway.execute(
    'return await tools.call("demo.createItem", {body: {name: "Ada"}});',
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /approval/);
  assert.equal(calls.length, 0);
  assert.equal(JSON.parse((await readFile(auditPath, 'utf8')).trim()).status, 'blocked');
});

test('approval is per call and bound to an immutable request snapshot', async (t) => {
  const { gateway, calls } = await fixture(t);
  const approvals = [];
  const result = await gateway.execute(
    'await tools.call("demo.createItem", {body: {name: "Ada"}}); return await tools.call("demo.createItem", {body: {name: "Grace"}});',
    async (request) => {
      approvals.push(structuredClone(request));
      request.args.body.name = 'tampered';
      return approvals.length === 1;
    },
  );
  assert.equal(result.ok, false);
  assert.equal(approvals.length, 2);
  assert.equal(approvals[0].method, 'POST');
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body), { name: 'Ada' });
});

test('invalid inputs never prompt or dispatch, including inherited properties', async (t) => {
  const { gateway, calls } = await fixture(t);
  let asked = false;
  const result = await gateway.execute(
    'return await tools.call("demo.createItem", {body: {name: 42}});',
    async () => {
      asked = true;
      return true;
    },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid arguments/);
  assert.equal(asked, false);
  assert.equal(calls.length, 0);
});

test('source block dominates tool allow; configured mutation allow is explicit', async (t) => {
  const f = await fixture(t, {
    policy: { sources: { demo: 'block' }, tools: { 'demo.createItem': 'allow' } },
  });
  assert.equal(
    (await f.gateway.execute('return await tools.call("demo.createItem", {body: {name: "Ada"}});'))
      .ok,
    false,
  );
  assert.equal(f.calls.length, 0);
  f.config.policy.sources = {};
  assert.equal(
    (await f.gateway.execute('return await tools.call("demo.createItem", {body: {name: "Ada"}});'))
      .ok,
    true,
  );
  assert.equal(f.calls.length, 1);
});

test('redirects cannot forward credentials or dispatch a second request', async (t) => {
  const { gateway, calls } = await fixture(t);
  assert.equal((await gateway.execute('return await tools.call("demo.redirect");')).ok, false);
  assert.equal(calls.length, 1);
});

test('path traversal is blocked before HTTP', async (t) => {
  const { gateway, calls } = await fixture(t);
  for (const id of ['..', '.', '../secret', 'a\\b']) {
    assert.equal(
      (
        await gateway.execute(
          `return await tools.call("demo.getItem", {id: ${JSON.stringify(id)}});`,
        )
      ).ok,
      false,
    );
  }
  assert.equal(calls.length, 0);
});

test('API errors and oversized responses are bounded', async (t) => {
  const { gateway } = await fixture(t);
  const error = await gateway.execute('return await tools.call("demo.error");');
  assert.match(error.error, /HTTP 500/);
  const huge = await gateway.execute('return await tools.call("demo.huge");');
  assert.match(huge.error, /size limit/);
  const output = await gateway.execute('return "a".repeat(100000);');
  assert.equal(output.ok, true);
  assert.equal(output.result.truncated, true);
});

test('infinite loops, unresolved promises, and stalled HTTP all time out', async (t) => {
  const { gateway } = await fixture(t, { limits: { timeoutMs: 400 } });
  for (const code of [
    'while(true) {}',
    'await new Promise(() => {});',
    'return await tools.call("demo.slow");',
  ]) {
    const before = Date.now();
    const result = await gateway.execute(code);
    assert.equal(result.ok, false);
    assert.ok(Date.now() - before < 2500);
  }
  assert.equal((await gateway.execute('return 42')).ok, true);
});

test('a stalled approval is cancelled without dispatch', async (t) => {
  const { gateway, calls } = await fixture(t, { limits: { timeoutMs: 400 } });
  const result = await gateway.execute(
    'return await tools.call("demo.createItem", {body: {name: "Ada"}});',
    () => new Promise(() => {}),
  );
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('memory exhaustion and call floods do not crash the host', async (t) => {
  const { gateway, calls } = await fixture(t, { limits: { memoryMb: 8, maxCalls: 2 } });
  const memory = await gateway.execute(
    'let x=[]; while(true) x.push(new Array(100000).fill("abcdef"));',
  );
  assert.equal(memory.ok, false);
  const flood = await gateway.execute(
    'for (let i=0;i<10;i++) await tools.call("demo.getItem", {id: "7"});',
  );
  assert.equal(flood.ok, false);
  assert.equal(calls.length, 2);
  assert.equal((await gateway.execute('return 42')).result, 42);
});

test('missing credentials and broken audit storage prevent API calls', async (t) => {
  const f = await fixture(t);
  const missing = new Gateway(f.config, f.registry, f.auditPath, {});
  assert.equal(
    (await missing.execute('return await tools.call("demo.getItem", {id:"7"});')).ok,
    false,
  );
  const broken = new Gateway(f.config, f.registry, join(f.specPath, 'audit.jsonl'), {
    TEST_KEY: 'secret',
  });
  assert.equal(
    (await broken.execute('return await tools.call("demo.getItem", {id:"7"});')).ok,
    false,
  );
  assert.equal(f.calls.length, 0);
});

test('external and cyclic references fail during loading', async (t) => {
  const f = await fixture(t);
  f.spec.components.schemas.Body = { $ref: 'file:///etc/passwd' };
  await writeFile(f.specPath, JSON.stringify(f.spec));
  await assert.rejects(Registry.load(f.config, f.directory), /External/);
  f.spec.components.schemas.Body = { $ref: '#/components/schemas/Body' };
  await writeFile(f.specPath, JSON.stringify(f.spec));
  await assert.rejects(Registry.load(f.config, f.directory), /[Cc]ircular/);
});

test('output preview accounts for JSON escaping and unicode', () => {
  for (const text of ['"'.repeat(5000), '\\'.repeat(5000), '💡'.repeat(5000)]) {
    const output = bounded(text, 1024);
    assert.equal(output.truncated, true);
    assert.ok(Buffer.byteLength(JSON.stringify(output)) <= 1024);
  }
});

test('credentialed remote HTTP is rejected before network dispatch', async (t) => {
  const f = await fixture(t);
  f.config.sources[0].baseUrl = 'http://example.invalid';
  const registry = await Registry.load(f.config, f.directory);
  const gateway = new Gateway(f.config, registry, f.auditPath, { TEST_KEY: 'secret' });
  const result = await gateway.execute('return await tools.call("demo.getItem", {id:"7"});');
  assert.equal(result.ok, false);
  assert.match(result.error, /HTTPS/);
  assert.equal(f.calls.length, 0);
});

test('cancellation frees run slots and concurrency remains bounded', async (t) => {
  const { gateway } = await fixture(t);
  const controller = new AbortController();
  const runs = Array.from({ length: 4 }, () =>
    gateway.execute('await new Promise(() => {});', undefined, controller.signal),
  );
  const fifth = await gateway.execute('return 42');
  assert.equal(fifth.ok, false);
  assert.match(fifth.error, /concurrent/);
  controller.abort();
  const results = await Promise.all(runs);
  assert.ok(results.every((result) => !result.ok));
  assert.equal((await gateway.execute('return 42')).result, 42);
});
