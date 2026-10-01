import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import { httpUrl, readResponse } from './http.js';
import type { Args, SourceConfig, Tool } from './types.js';

// OpenAPI is parsed data, never executable configuration. Unsupported forms fail explicitly.
type Node = Record<string, any>;
const methods = ['get', 'head', 'options', 'post', 'put', 'patch', 'delete'];
const ajv = new Ajv({ strict: false, validateFormats: false, ownProperties: true });
const specLimit = 5 * 1024 * 1024;

export async function loadSource(source: SourceConfig, directory: string): Promise<Tool[]> {
  let json: string;
  if (/^https?:\/\//.test(source.spec)) {
    const response = await fetch(httpUrl(source.spec), {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Spec request failed: HTTP ${response.status}`);
    json = await readResponse(response, specLimit);
  } else {
    const path = resolve(directory, source.spec);
    if ((await stat(path)).size > specLimit) throw new Error('Spec exceeds 5 MB');
    json = await readFile(path, 'utf8');
  }
  const raw = JSON.parse(json);
  if (!/^3\.0\./.test(raw.openapi)) throw new Error('Only OpenAPI 3.0 JSON is supported in v0.1');
  function checkRefs(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === '$async') throw new Error('Async schemas are not supported');
      if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#/')))
        throw new Error('External $ref is disabled; bundle the spec first');
      checkRefs(child);
    }
  }
  checkRefs(raw);
  const spec = (await SwaggerParser.dereference(raw, {
    resolve: { external: false, file: false, http: false },
    dereference: { circular: false },
  })) as Node;
  const base = httpUrl(source.baseUrl ?? spec.servers?.[0]?.url ?? '');
  if (base.search || /[{}]/.test(base.href))
    throw new Error('Supply a concrete baseUrl without a query or server variables');
  const basePath = base.pathname.replace(/\/$/, '');
  const tools: Tool[] = [];
  for (const [route, item] of Object.entries(spec.paths ?? {}) as [string, Node][]) {
    if (
      !route.startsWith('/') ||
      /[?#\\]/.test(route) ||
      route.split('/').some((s) => s === '.' || s === '..')
    )
      throw new Error('Invalid OpenAPI path');
    for (const method of methods) {
      const operation: Node = item[method];
      if (!operation) continue;
      if (!source.baseUrl && (item.servers || operation.servers))
        throw new Error('Per-operation servers require an explicit source baseUrl');
      const id = operation.operationId ?? `${method}_${route.replace(/[^a-zA-Z0-9]+/g, '_')}`;
      if (!/^[a-zA-Z0-9_-]+$/.test(id))
        throw new Error('Operation IDs must contain letters, digits, underscores, or hyphens');
      const parameters = [
        ...new Map<string, Node>(
          [...(item.parameters ?? []), ...(operation.parameters ?? [])].map((p: Node) => [
            `${p.in}:${p.name}`,
            p,
          ]),
        ).values(),
      ];
      const properties: Node = Object.create(null);
      const required: string[] = [];
      for (const p of parameters) {
        if (!['path', 'query'].includes(p.in))
          throw new Error(
            `${id}: only path/query parameters are supported; configure headers on the source`,
          );
        if (
          p.name === 'body' ||
          Object.hasOwn(properties, p.name) ||
          ['__proto__', 'constructor', 'prototype'].includes(p.name)
        )
          throw new Error(`${id}: ambiguous parameter name`);
        if (
          !p.schema ||
          p.allowReserved ||
          (p.style && p.style !== (p.in === 'query' ? 'form' : 'simple'))
        )
          throw new Error(`${id}: unsupported parameter serialization`);
        if (
          !['string', 'number', 'integer', 'boolean'].includes(p.schema.type) &&
          !(
            p.in === 'query' &&
            p.schema.type === 'array' &&
            ['string', 'number', 'integer', 'boolean'].includes(p.schema.items?.type)
          )
        )
          throw new Error(`${id}: unsupported parameter type`);
        properties[p.name] = p.schema;
        if (p.required || p.in === 'path') required.push(p.name);
      }
      if (operation.requestBody) {
        const body = operation.requestBody.content?.['application/json']?.schema;
        if (!body || ['get', 'head'].includes(method))
          throw new Error(`${id}: only JSON request bodies on mutations are supported`);
        properties.body = body;
        if (operation.requestBody.required) required.push('body');
      }
      const inputSchema = { type: 'object', properties, required, additionalProperties: false };
      // Compile trusted schemas at import time to fail early. Agent arguments
      // are validated separately in a terminable worker before request preparation.
      ajv.compile(inputSchema);
      tools.push({
        path: `${source.name}.${id}`,
        source: source.name,
        description: String(
          operation.summary ?? operation.description ?? `${method.toUpperCase()} ${route}`,
        ).slice(0, 2000),
        method: method.toUpperCase(),
        safe: ['get', 'head', 'options'].includes(method),
        inputSchema,
        prepare(args: Args) {
          let pathname = route;
          for (const p of parameters.filter((p) => p.in === 'path')) {
            const value = String(args[p.name]);
            if (value === '.' || value === '..' || /[\/\\]/.test(value))
              throw new Error('Path arguments cannot contain traversal or slashes');
            pathname = pathname.replaceAll(`{${p.name}}`, encodeURIComponent(value));
          }
          if (/[{}]/.test(pathname)) throw new Error('Unresolved path parameter');
          const url = new URL(base.href);
          url.pathname = basePath + pathname;
          if (url.origin !== base.origin || !url.pathname.startsWith(basePath + '/'))
            throw new Error('Request escaped its configured base URL');
          for (const p of parameters.filter((p) => p.in === 'query')) {
            const value = args[p.name];
            if (value === undefined) continue;
            if (Array.isArray(value) && p.explode !== false)
              value.forEach((v) => url.searchParams.append(p.name, String(v)));
            else
              url.searchParams.append(
                p.name,
                Array.isArray(value) ? value.join(',') : String(value),
              );
          }
          return {
            url,
            method: method.toUpperCase(),
            ...(args.body !== undefined ? { body: JSON.stringify(args.body) } : {}),
          };
        },
      });
    }
  }
  return tools;
}
