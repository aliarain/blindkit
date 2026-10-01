import { mkdir, copyFile } from 'node:fs/promises';
await mkdir(new URL('../public/reference/', import.meta.url), { recursive: true });
await copyFile(
  new URL('../../LICENSE', import.meta.url),
  new URL('../public/license.txt', import.meta.url),
);
await copyFile(
  new URL('../../AGENTS.md', import.meta.url),
  new URL('../public/reference/AGENTS.txt', import.meta.url),
);
