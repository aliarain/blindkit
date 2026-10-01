#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { dirname, resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { configSchema, sourceSchema } from './types.js';
import { defaultAuditPath, readConfig, writeConfig } from './config.js';
import { Registry } from './registry.js';
import { Gateway } from './gateway.js';
import { createServer } from './server.js';
import { version } from './metadata.js';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      audit: { type: 'string' },
      name: { type: 'string' },
      'base-url': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const [command, spec] = positionals;
  if (values.version) {
    console.log(version);
    return;
  }
  if (values.help || !command) {
    console.log(
      'Blindkit — local API tools for your agent\n\nblindkit init [--config path]\nblindkit add <spec.json or URL> --name <name> [--base-url URL] [--config path]\nblindkit serve [--config path] [--audit path]\n\nCredentials: edit source.headers in the config using env://NAME references.',
    );
    return;
  }
  const allowed: Record<string, string[]> = {
    init: ['config'],
    add: ['config', 'name', 'base-url'],
    serve: ['config', 'audit'],
  };
  if (!Object.hasOwn(allowed, command)) {
    throw new Error('Unknown command. Run blindkit --help.');
  }
  if (positionals.length !== (command === 'add' ? 2 : 1)) {
    throw new Error('Unexpected or missing arguments. Run blindkit --help.');
  }
  for (const option of Object.keys(values)) {
    if (!allowed[command].includes(option)) {
      throw new Error(`--${option} is not supported by ${command}`);
    }
  }
  if (command === 'init') {
    const path = resolve(values.config ?? 'blindkit.json');
    await writeConfig(path, configSchema.parse({}), true);
    console.log(`Created ${path}\nNext: blindkit add <spec.json or URL> --name <name>`);
    return;
  }
  const { config, path } = await readConfig(values.config);
  if (command === 'add') {
    if (!spec || !values.name)
      throw new Error('Usage: blindkit add <spec.json or URL> --name <name>');
    const source = sourceSchema.parse({
      name: values.name,
      type: 'openapi',
      spec: /^https?:\/\//.test(spec) ? spec : resolve(spec),
      baseUrl: values['base-url'],
    });
    if (config.sources.some((s) => s.name === source.name))
      throw new Error('That source name already exists');
    const updated = configSchema.parse({ ...config, sources: [...config.sources, source] });
    const registry = await Registry.load(updated, dirname(path));
    await writeConfig(path, updated);
    console.log(
      `Added ${source.name}. ${registry.tools.size} operations available across all sources.\nNext: blindkit serve`,
    );
    return;
  }
  const registry = await Registry.load(config, dirname(path));
  const gateway = new Gateway(config, registry, resolve(values.audit ?? defaultAuditPath()));
  // Direct stdio serves the broadly supported 2025 MCP handshake and form elicitation.
  const server = createServer(gateway);
  await server.connect(new StdioServerTransport());
  console.error(
    `Blindkit ready: ${config.sources.length} sources, ${registry.tools.size} operations`,
  );
}

main().catch((error) => {
  console.error(`Blindkit: ${error instanceof Error ? error.message : 'Startup failed'}`);
  process.exitCode = 1;
});
