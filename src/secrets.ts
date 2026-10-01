import type { SourceConfig } from './types.js';

const environmentReference = /env:\/\/([A-Za-z_][A-Za-z0-9_]*)/g;
const sensitiveKeys = new Set([
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'password',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'xapikey',
  'clientsecret',
  'privatekey',
]);

function isSensitiveKey(key: string): boolean {
  return sensitiveKeys.has(key.replace(/[-_]/g, '').toLowerCase());
}

export class Secrets {
  private secretValues = new Set<string>();
  private matcher?: RegExp;

  constructor(
    private sources: SourceConfig[],
    private env: NodeJS.ProcessEnv = process.env,
  ) {
    // Register every configured value before any input, logs, or results are exposed.
    for (const source of sources) {
      for (const template of Object.values(source.headers)) {
        for (const match of template.matchAll(environmentReference)) {
          this.remember(env[match[1]]);
        }
      }
    }
  }

  headers(sourceName: string): Headers {
    const source = this.sources.find((source) => source.name === sourceName)!;
    const headers = new Headers();

    for (const [name, template] of Object.entries(source.headers)) {
      if (isSensitiveKey(name) && !template.includes('env://')) {
        throw new Error('Credential headers must use env:// references');
      }

      const resolved = template.replace(environmentReference, (_, name: string) => {
        const secretValue = this.env[name];
        if (!secretValue) {
          throw new Error(`Missing environment variable: ${name}`);
        }
        this.remember(secretValue);
        return secretValue;
      });

      if (resolved.includes('env://')) {
        throw new Error('Invalid secret reference');
      }
      headers.set(name, resolved);
    }

    return headers;
  }

  text(text: string): string {
    if (this.secretValues.size === 0) {
      return text;
    }
    const longestFirst = [...this.secretValues].sort((left, right) => right.length - left.length);
    this.matcher ??= new RegExp(
      longestFirst.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'g',
    );
    // One pass prevents short secrets from repeatedly expanding the replacement marker.
    return text.replace(this.matcher, '[REDACTED]');
  }

  redact(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.text(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (value && typeof value === 'object') {
      const entries: [string, unknown][] = [];
      for (const [key, item] of Object.entries(value)) {
        const redacted = isSensitiveKey(key) ? '[REDACTED]' : this.redact(item);
        entries.push([this.text(key), redacted]);
      }
      return Object.fromEntries(entries);
    }

    return value;
  }

  private remember(secretValue?: string) {
    if (!secretValue) {
      return;
    }

    this.secretValues.add(secretValue);
    this.secretValues.add(encodeURIComponent(secretValue));
    this.secretValues.add(Buffer.from(secretValue).toString('base64'));
    this.matcher = undefined;
  }
}
