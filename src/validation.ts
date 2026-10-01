import { Worker } from 'node:worker_threads';
import type { Args } from './types.js';

let active = 0;
const waiting: (() => void)[] = [];

// Validation can execute schema regexes. Keep it off the host event loop and
// cap workers so parallel guest calls cannot create an unbounded process load.
export async function validateArgs(
  schema: Record<string, unknown>,
  args: Args,
  signal: AbortSignal,
): Promise<void> {
  await acquire(signal);
  let worker: Worker | undefined;
  try {
    signal.throwIfAborted();
    worker = new Worker(new URL('./validation-worker.js', import.meta.url), {
      workerData: { schema, args },
      env: {},
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 32, stackSizeMb: 2 },
    });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener('abort', cancel);
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      };
      const cancel = () => finish(new Error('Validation cancelled or timed out'));
      signal.addEventListener('abort', cancel, { once: true });
      worker!.on('message', (message) => {
        if (message.valid === true) {
          finish();
        } else {
          finish(new Error(`Invalid arguments: ${message.error}`));
        }
      });
      worker!.on('error', () => finish(new Error('Input validation exhausted its resource limit')));
      worker!.on('exit', () => finish(new Error('Input validation exited without a result')));
      if (signal.aborted) {
        cancel();
      }
    });
  } finally {
    await worker?.terminate();
    active--;
    waiting.shift()?.();
  }
}

function acquire(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const index = waiting.indexOf(start);
      if (index !== -1) {
        waiting.splice(index, 1);
      }
      reject(new Error('Validation cancelled or timed out'));
    };
    const start = () => {
      signal.removeEventListener('abort', cancel);
      active++;
      resolve();
    };
    if (signal.aborted) {
      cancel();
    } else if (active < 4) {
      start();
    } else {
      waiting.push(start);
      signal.addEventListener('abort', cancel, { once: true });
    }
  });
}
