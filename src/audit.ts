import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { constants } from 'node:fs';
import { bounded } from './http.js';
import type { Secrets } from './secrets.js';

export class Audit {
  private queue = Promise.resolve();
  constructor(
    readonly path: string,
    private secrets: Secrets,
  ) {}
  write(entry: Record<string, unknown>): Promise<void> {
    const line =
      JSON.stringify({
        time: new Date().toISOString(),
        ...Object.fromEntries(
          Object.entries(entry).map(([k, v]) => [k, bounded(this.secrets.redact(v), 8192)]),
        ),
      }) + '\n';
    const write = this.queue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const file = await open(
        this.path,
        constants.O_APPEND |
          constants.O_CREAT |
          constants.O_WRONLY |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK,
        0o600,
      );
      try {
        if (!(await file.stat()).isFile()) {
          throw new Error('Audit output must be a regular file');
        }
        await file.chmod(0o600);
        await file.writeFile(line);
        await file.sync();
      } finally {
        await file.close();
      }
    });
    this.queue = write.catch(() => {});
    return write;
  }
}
