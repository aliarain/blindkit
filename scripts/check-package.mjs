// Build first. Exercise the tarball from an isolated, production-only install.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fixture } from '../test/fixture.mjs';

const run = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'blindkit-package-'));
const artifacts = resolve('artifacts');
const cleanup = [];
let client;
try {
  await mkdir(artifacts, { recursive: true });
  const { stdout } = await run('npm', [
    'pack',
    '--ignore-scripts',
    '--json',
    '--pack-destination',
    artifacts,
  ]);
  const [pack] = JSON.parse(stdout);
  const tarball = join(artifacts, pack.filename);
  const files = pack.files.map((file) => file.path);
  for (const required of [
    'dist/cli.js',
    'dist/sandbox-worker.js',
    'dist/validation-worker.js',
    'docs/security.md',
    'examples/posts.openapi.json',
    'LICENSE',
  ]) {
    assert.ok(files.includes(required), `Missing package file: ${required}`);
  }
  assert.ok(
    files.every(
      (file) =>
        !/^(node_modules|test|scripts|opensrc|artifacts|\.env|blindkit\.json)(\/|$)/.test(file),
    ),
  );
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const env = {
    ...process.env,
    PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
    npm_config_cache: join(directory, 'cache'),
  };
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'blindkit-install-check', private: true }),
  );
  await run(
    'npm',
    ['install', tarball, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: directory, env, timeout: 180000, maxBuffer: 1024 * 1024 },
  );
  const installed = join(directory, 'node_modules/blindkit');
  const binary = join(directory, 'node_modules/.bin/blindkit');
  assert.equal((await run(binary, ['--version'], { env })).stdout.trim(), manifest.version);
  assert.match((await run(binary, ['--help'], { env })).stdout, /blindkit init/);
  assert.equal((await stat(binary)).mode & 0o111, 0o111);
  const mock = await fixture({ after: (handler) => cleanup.push(handler) });
  const config = join(directory, 'blindkit.json');
  await run(binary, ['init', '--config', config], { env });
  await run(
    binary,
    [
      'add',
      join(installed, 'examples/posts.openapi.json'),
      '--name',
      'posts',
      '--base-url',
      mock.baseUrl,
      '--config',
      config,
    ],
    { env },
  );
  client = new Client(
    { name: 'package-check', version: '1' },
    { versionNegotiation: { mode: 'legacy' }, capabilities: { elicitation: { form: {} } } },
  );
  let approve = false;
  client.setRequestHandler('elicitation/create', async () => ({
    action: 'accept',
    content: { confirm: approve },
  }));
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        join(installed, 'dist/cli.js'),
        'serve',
        '--config',
        config,
        '--audit',
        join(directory, 'audit.jsonl'),
      ],
      stderr: 'pipe',
    }),
  );
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
    'execute',
    'search',
  ]);
  const execute = async (code) =>
    JSON.parse((await client.callTool({ name: 'execute', arguments: { code } })).content[0].text);
  assert.equal((await execute('return await tools.call("posts.getPost", {id:1});')).result.id, 7);
  const mutation =
    'return await tools.call("posts.createPost", {body:{title:"demo",body:"test",userId:1}});';
  assert.equal((await execute(mutation)).ok, false);
  assert.equal(mock.calls.length, 1);
  approve = true;
  assert.equal((await execute(mutation)).ok, true);
  assert.equal(mock.calls.length, 2);
  const report = {
    version: manifest.version,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    tarball,
    sha256: createHash('sha256')
      .update(await readFile(tarball))
      .digest('hex'),
    files: files.length,
    checks: [
      'production-only clean install',
      'executable CLI',
      'version/help',
      'init/add',
      'stdio discovery',
      'read',
      'denied write',
      'approved write',
    ],
    passed: true,
    time: new Date().toISOString(),
  };
  await writeFile(join(artifacts, 'package-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client?.close();
  for (const handler of cleanup.reverse()) await handler();
  await rm(directory, { recursive: true, force: true });
}
