import { Worker } from 'node:worker_threads';
import type { Args, Config, Execution } from './types.js';

export async function execute(
  code: string,
  limits: Config['limits'],
  call: (path: string, args: Args, signal: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<Execution> {
  if (Buffer.byteLength(code) > 65_536) return { ok: false, error: 'Code exceeds 64 KB', logs: [] };
  if (signal?.aborted) return { ok: false, error: 'Execution cancelled', logs: [] };
  const worker = new Worker(new URL('./sandbox-worker.js', import.meta.url), {
    workerData: { code, limits },
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
  });
  const controller = new AbortController();
  const pending = new Set<Promise<void>>();
  let count = 0;
  const result = await new Promise<Execution>((resolve) => {
    let finished = false;
    const finish = (value: Execution) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controller.abort();
      resolve(value);
    };
    const cancel = () => finish({ ok: false, error: 'Execution cancelled', logs: [] });
    const timer = setTimeout(
      () =>
        finish({ ok: false, error: `Execution timed out after ${limits.timeoutMs}ms`, logs: [] }),
      limits.timeoutMs,
    );
    signal?.addEventListener('abort', cancel, { once: true });
    worker.on('error', () =>
      finish({ ok: false, error: 'Sandbox failed or exhausted its memory limit', logs: [] }),
    );
    worker.on('exit', () =>
      finish({ ok: false, error: 'Sandbox exited before returning a result', logs: [] }),
    );
    worker.on('message', (message) => {
      if (finished) return;
      if (message.type === 'done') return finish(message.value);
      if (message.type !== 'call') return;
      if (++count > limits.maxCalls)
        return finish({ ok: false, error: 'Tool call limit exceeded', logs: [] });
      const task = (async () => {
        try {
          const value = await call(message.path, message.args, controller.signal);
          if (!finished) worker.postMessage({ id: message.id, value });
        } catch (error) {
          if (!finished)
            worker.postMessage({
              id: message.id,
              error: error instanceof Error ? error.message : 'Tool call failed',
            });
        }
      })();
      pending.add(task);
      void task.finally(() => pending.delete(task));
    });
  });
  await worker.terminate();
  // Host operations receive the abort signal. Never leave approvals or fetches alive after a run.
  await Promise.allSettled(pending);
  return result;
}
