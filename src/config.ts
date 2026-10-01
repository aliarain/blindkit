import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { configSchema, type Config } from './types.js';

export const defaultAuditPath = () => resolve(homedir(), '.blindkit/audit.jsonl');
export async function readConfig(explicit?: string): Promise<{ config: Config; path: string }> {
  const paths = explicit
    ? [resolve(explicit)]
    : [resolve('blindkit.json'), resolve(homedir(), '.blindkit/config.json')];
  for (const path of paths) {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    try {
      return { config: configSchema.parse(JSON.parse(text)), path };
    } catch {
      throw new Error(`Invalid config at ${path}; see docs/config.md`);
    }
  }
  throw new Error('No config found. Run blindkit init first.');
}
export async function writeConfig(path: string, config: Config, create = false): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const text = JSON.stringify(config, null, 2) + '\n';
  if (create) {
    await writeFile(path, text, { flag: 'wx', mode: 0o600 });
    return;
  }
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, text, { flag: 'wx', mode: 0o600 });
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
