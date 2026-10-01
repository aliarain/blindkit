import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { configSchema } from '../dist/types.js';
import { Registry } from '../dist/registry.js';
import { Gateway } from '../dist/gateway.js';

export async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'blindkit-'));
  const calls = [];
  const server = createServer(async (req, res) => {
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    calls.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: Buffer.concat(parts).toString(),
    });
    if (req.url === '/slow') return;
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/stolen' });
      res.end();
      return;
    }
    if (req.url === '/huge') {
      res.end('a'.repeat(2_000_000));
      return;
    }
    if (req.url === '/error') {
      res.writeHead(500);
      res.end('s3cr3t-test-value');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        id: 7,
        name: 'Ada',
        url: req.url,
        echoed: req.headers.authorization ?? '',
        token: 'other-api-secret',
        body: parts.length ? JSON.parse(Buffer.concat(parts).toString()) : null,
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const operation = (operationId, extras = {}) => ({
    operationId,
    responses: { 200: { description: 'OK' } },
    ...extras,
  });
  const spec = {
    openapi: '3.0.3',
    info: { title: 'Test', version: '1' },
    servers: [{ url: baseUrl }],
    components: {
      schemas: {
        Body: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        },
      },
    },
    paths: {
      '/items/{id}': {
        get: operation('getItem', {
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'tags', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          ],
        }),
      },
      '/items': {
        post: operation('createItem', {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Body' } } },
          },
        }),
      },
      ...Object.fromEntries(
        ['redirect', 'huge', 'slow', 'error'].map((name) => [`/${name}`, { get: operation(name) }]),
      ),
    },
  };
  const specPath = join(directory, 'spec.json');
  await writeFile(specPath, JSON.stringify(spec));
  const config = configSchema.parse({
    sources: [
      {
        name: 'demo',
        type: 'openapi',
        spec: specPath,
        headers: { authorization: 'Bearer env://TEST_KEY' },
      },
    ],
    ...overrides,
  });
  const registry = await Registry.load(config, directory);
  const auditPath = join(directory, 'audit.jsonl');
  const gateway = new Gateway(config, registry, auditPath, { TEST_KEY: 's3cr3t-test-value' });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, gateway, config, registry, calls, spec, specPath, auditPath, baseUrl };
}
