import { parentPort, workerData } from 'node:worker_threads';
import { getQuickJS, type QuickJSDeferredPromise } from 'quickjs-emscripten';
import { bounded } from './http.js';
import type { Config } from './types.js';

const { code, limits } = workerData as { code: string; limits: Config['limits'] };
const port = parentPort!;
const vm = (await getQuickJS()).newContext();
const deadline = Date.now() + limits.timeoutMs;
vm.runtime.setMemoryLimit(limits.memoryMb * 1024 * 1024);
vm.runtime.setMaxStackSize(512 * 1024);
vm.runtime.setInterruptHandler(() => Date.now() >= deadline);
const pending = new Map<number, QuickJSDeferredPromise>();
const logs: string[] = [];
let logBytes = 0;
let nextId = 0;
let done = false;

function finish(ok: boolean, value: unknown) {
  if (done) return;
  done = true;
  port.postMessage({
    type: 'done',
    value: ok
      ? { ok, result: bounded(value, limits.outputBytes), logs }
      : { ok, error: String(value).slice(0, 2048), logs },
  });
}
function pump() {
  if (done) return;
  const jobs = vm.runtime.executePendingJobs();
  if (jobs.error) {
    jobs.error.dispose();
    finish(false, 'Sandbox interrupted or exhausted its memory limit');
  }
}
vm.newFunction('__call', (pathHandle, argsHandle) => {
  const path = vm.getString(pathHandle);
  const json = vm.getString(argsHandle);
  if (path.length > 256 || Buffer.byteLength(json) > 32_768)
    throw new Error('Tool arguments exceed 32 KB');
  const args = JSON.parse(json);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Tool arguments must be an object');
  if (nextId >= limits.maxCalls) throw new Error('Tool call limit exceeded');
  const id = ++nextId;
  const deferred = vm.newPromise();
  pending.set(id, deferred);
  port.postMessage({ type: 'call', id, path, args });
  return deferred.handle;
}).consume((fn) => vm.setProp(vm.global, '__call', fn));
vm.newFunction('__log', (handle) => {
  if (logs.length >= 100 || logBytes >= 8192) return;
  const text = Buffer.from(vm.getString(handle))
    .subarray(0, Math.min(2048, 8192 - logBytes))
    .toString('utf8');
  logBytes += Buffer.byteLength(text);
  logs.push(text);
}).consume((fn) => vm.setProp(vm.global, '__log', fn));
vm.newFunction('__done', (handle) => {
  finish(true, JSON.parse(vm.getString(handle)));
}).consume((fn) => vm.setProp(vm.global, '__done', fn));
vm.newFunction('__error', (handle) => finish(false, vm.getString(handle))).consume((fn) =>
  vm.setProp(vm.global, '__error', fn),
);

port.on('message', (message) => {
  if (done) return;
  const deferred = pending.get(message.id);
  if (!deferred) return;
  pending.delete(message.id);
  const handle = message.error
    ? vm.newError(message.error)
    : vm.newString(JSON.stringify(message.value));
  if (message.error) deferred.reject(handle);
  else deferred.resolve(handle);
  handle.dispose();
  deferred.dispose();
  pump();
});

// Capture host bridges, then remove their global names. Only JSON crosses the boundary.
const result = vm.evalCode(
  `
  ((call, log, done, fail) => {
    delete globalThis.__call; delete globalThis.__log; delete globalThis.__done; delete globalThis.__error;
    const stringify = JSON.stringify.bind(JSON), parse = JSON.parse.bind(JSON);
    globalThis.tools = Object.freeze({ call: async (path, args = {}) => parse(await call(String(path), stringify(args))) });
    globalThis.console = Object.freeze({ log: (...values) => log(values.map(v => typeof v === 'string' ? v : stringify(v)).join(' ')) });
    (async () => { "use strict";\n${code}\n})()
      .then(value => done(stringify(value === undefined ? null : value)))
      .catch(error => fail(String(error?.message ?? error)));
  })(__call, __log, __done, __error);
`,
  'blindkit.js',
);
if (result.error) {
  result.error.dispose();
  finish(false, 'Invalid JavaScript, interrupted execution, or exhausted memory');
} else {
  result.value.dispose();
  pump();
}
// A never-settling guest Promise is handled by the parent's wall-clock deadline.
