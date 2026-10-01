import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './fixture.mjs';
import { Registry } from '../dist/registry.js';
import { Gateway } from '../dist/gateway.js';
import { Secrets } from '../dist/secrets.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('catastrophic schema regex cannot block the host or outlive the run', async (t) => {
  const f = await fixture(t, { limits: { timeoutMs: 700 } });
  f.spec.components.schemas.Body.properties.name.pattern = '^(a+)+$';
  await writeFile(f.specPath, JSON.stringify(f.spec));
  const registry = await Registry.load(f.config, f.directory);
  const gateway = new Gateway(f.config, registry, f.auditPath, { TEST_KEY: 'secret' });
  let hostResponsive = false;
  const heartbeat = setTimeout(() => {
    hostResponsive = true;
  }, 100);
  const start = Date.now();
  const result = await gateway.execute(
    'return await tools.call("demo.createItem", {body:{name:"a".repeat(200) + "!"}});',
    async () => true,
  );
  clearTimeout(heartbeat);
  assert.equal(hostResponsive, true);
  assert.equal(result.ok, false);
  assert.ok(Date.now() - start < 2500);
  assert.equal(f.calls.length, 0);
  assert.equal((await gateway.execute('return 42')).result, 42);
});

test('saturated validation queue is cancelled and reusable', async (t) => {
  const f = await fixture(t, { limits: { timeoutMs: 800 } });
  f.spec.components.schemas.Body.properties.name.pattern = '^(a+)+$';
  await writeFile(f.specPath, JSON.stringify(f.spec));
  const registry = await Registry.load(f.config, f.directory);
  const gateway = new Gateway(f.config, registry, f.auditPath, { TEST_KEY: 'secret' });
  const result = await gateway.execute(
    'return await Promise.all(Array.from({length:12}, () => tools.call("demo.createItem", {body:{name:"a".repeat(200) + "!"}})));',
    async () => true,
  );
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.gateway.execute('return await tools.call("demo.getItem", {id:"7"});')).ok,
    true,
  );
});

test('async schemas cannot bypass argument checks', async (t) => {
  const f = await fixture(t);
  f.spec.components.schemas.Body.$async = true;
  await writeFile(f.specPath, JSON.stringify(f.spec));
  await assert.rejects(Registry.load(f.config, f.directory), /Async schemas/);
});

test('credential header variants require references and response variants are redacted', () => {
  for (const name of ['X-API-Key', 'apiKey', 'client_secret', 'accessToken']) {
    const secrets = new Secrets(
      [{ name: 'demo', type: 'openapi', spec: 'test.json', headers: { [name]: 'literal-secret' } }],
      {},
    );
    assert.throws(() => secrets.headers('demo'), /env:\/\//);
    assert.deepEqual(secrets.redact({ [name]: 'unknown-secret' }), { [name]: '[REDACTED]' });
  }
});

test('short overlapping secrets do not repeatedly expand redaction markers', () => {
  const secrets = new Secrets(
    [
      {
        name: 'demo',
        type: 'openapi',
        spec: 'test.json',
        headers: { one: 'env://FIRST', two: 'env://SECOND' },
      },
    ],
    { FIRST: 'A', SECOND: 'D' },
  );
  assert.equal(secrets.text('A D'), '[REDACTED] [REDACTED]');
});

test('argument prototype tricks cannot satisfy required properties', async (t) => {
  const { gateway, calls } = await fixture(t);
  const result = await gateway.execute(
    'return await tools.call("demo.createItem", {body:Object.create({name:"Ada"})});',
    async () => true,
  );
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('symlink audit targets are refused before dispatch', async (t) => {
  const f = await fixture(t);
  const target = join(f.directory, 'must-not-change.txt');
  await writeFile(target, 'untouched');
  await symlink(target, f.auditPath);
  const result = await f.gateway.execute('return await tools.call("demo.getItem", {id:"7"});');
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 0);
  assert.equal(await readFile(target, 'utf8'), 'untouched');
});

test('FIFO audit targets fail promptly without dispatch or a stuck cleanup', async (t) => {
  const f = await fixture(t);
  await promisify(execFile)('mkfifo', [f.auditPath]);
  const start = Date.now();
  const result = await f.gateway.execute('return await tools.call("demo.getItem", {id:"7"});');
  assert.equal(result.ok, false);
  assert.equal(f.calls.length, 0);
  assert.ok(Date.now() - start < 3000);
});

test('delayed approval cannot dispatch after cancellation', async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  let answer;
  const running = f.gateway.execute(
    'return await tools.call("demo.createItem", {body:{name:"Ada"}});',
    () =>
      new Promise((resolve) => {
        answer = resolve;
        controller.abort();
      }),
    controller.signal,
  );
  assert.equal((await running).ok, false);
  answer(true);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(f.calls.length, 0);
});

test('native function constructors and dynamic import stay inside QuickJS', async (t) => {
  const { gateway } = await fixture(t);
  const result = await gateway.execute(
    'const global = await tools.call.constructor("return globalThis")(); let imported = false; try { await import("node:fs"); imported = true; } catch {} return {process:typeof global.process, require:typeof global.require, imported};',
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, { process: 'undefined', require: 'undefined', imported: false });
});
