import { randomUUID } from 'node:crypto';
import { Audit } from './audit.js';
import { readResponse } from './http.js';
import { decide } from './policy.js';
import { Registry } from './registry.js';
import { execute } from './sandbox.js';
import { Secrets } from './secrets.js';
import { validateArgs } from './validation.js';
import type { Approval, Args, Config, Execution } from './types.js';

async function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        cancel = () => reject(new Error('Execution cancelled or timed out'));
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) {
          cancel();
        }
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

export class Gateway {
  readonly secrets: Secrets;
  readonly audit: Audit;
  private active = 0;

  constructor(
    readonly config: Config,
    readonly registry: Registry,
    auditPath: string,
    env?: NodeJS.ProcessEnv,
  ) {
    this.secrets = new Secrets(config.sources, env);
    this.audit = new Audit(auditPath, this.secrets);
  }

  async call(path: string, args: Args, approve: Approval, signal: AbortSignal): Promise<unknown> {
    const id = randomUUID();
    const started = Date.now();
    const tool = this.registry.tools.get(path);
    const decision = tool ? decide(tool, this.config.policy) : 'block';
    const record = { id, tool: path, args, decision };
    let dispatched = false;

    try {
      signal.throwIfAborted();
      if (!tool) {
        throw new Error('Unknown tool');
      }
      if (decision === 'block') {
        throw new Error('Blocked by policy');
      }

      await validateArgs(tool.inputSchema, args, signal);
      signal.throwIfAborted();

      // Validate and snapshot arguments before asking; the exact same request is sent after consent.
      const request = tool.prepare(args);
      const source = this.config.sources.find((source) => source.name === tool.source)!;
      const hasSecrets = Object.values(source.headers).some((value) => value.includes('env://'));
      const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(request.url.hostname);
      if (hasSecrets && request.url.protocol !== 'https:' && !isLoopback) {
        throw new Error('Credentialed requests require HTTPS outside loopback');
      }

      const headers = this.secrets.headers(tool.source);
      if (request.body !== undefined) {
        headers.set('content-type', 'application/json');
      }

      if (decision === 'approve') {
        const approved = await cancellable(
          approve(
            { tool: path, method: tool.method, url: request.url.href, args: structuredClone(args) },
            signal,
          ),
          signal,
        );
        if (!approved) {
          throw new Error('Human approval was declined or is unavailable');
        }
      }

      signal.throwIfAborted();
      // Persist intent before touching the API. Audit failures stop the call.
      await this.audit.write({ ...record, status: 'started' });
      signal.throwIfAborted();

      dispatched = true;
      const response = await fetch(request.url, {
        method: request.method,
        body: request.body,
        headers,
        redirect: 'error',
        signal,
      });
      const text = await readResponse(response, this.config.limits.responseBytes);
      if (!response.ok) {
        throw new Error(`API returned HTTP ${response.status}`);
      }

      const result = this.secrets.redact(parseResponse(text));
      await this.audit.write({
        ...record,
        status: 'succeeded',
        httpStatus: response.status,
        durationMs: Date.now() - started,
        result,
      });
      return result;
    } catch (error) {
      const message = this.secrets.text(callErrorMessage(error, signal));
      try {
        await this.audit.write({
          ...record,
          status: dispatched ? 'failed-after-dispatch' : 'blocked',
          durationMs: Date.now() - started,
          error: message,
        });
      } catch {
        throw new Error(
          'Audit write failed; check the local audit path. A dispatched request may already have taken effect.',
        );
      }
      throw new Error(message);
    }
  }

  async execute(
    code: string,
    approve: Approval = async () => false,
    signal?: AbortSignal,
  ): Promise<Execution> {
    if (this.active >= 4) {
      return {
        ok: false,
        error: 'Too many concurrent executions; retry when a run finishes',
        logs: [],
      };
    }

    this.active++;
    try {
      const result = await execute(
        code,
        this.config.limits,
        (path, args, runSignal) => this.call(path, args, approve, runSignal),
        signal,
      );
      return this.secrets.redact(result) as Execution;
    } finally {
      this.active--;
    }
  }
}

function parseResponse(text: string): unknown {
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // APIs may return plain text even when the request body was JSON.
    return text;
  }
}

function callErrorMessage(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) {
    return 'Execution cancelled or timed out';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Tool call failed';
}
