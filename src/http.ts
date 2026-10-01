export function httpUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error('Use an HTTP(S) URL without credentials or a fragment');
  return url;
}

export async function readResponse(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('Response exceeds the configured size limit');
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function bounded(value: unknown, maxBytes: number): unknown {
  const json = JSON.stringify(value);
  if (Buffer.byteLength(json) <= maxBytes) return value;
  const output = {
    truncated: true,
    bytes: Buffer.byteLength(json),
    preview: json.slice(0, maxBytes - 256),
  };
  // Escaping quotes/control characters can grow the serialized preview.
  while (Buffer.byteLength(JSON.stringify(output)) > maxBytes)
    output.preview = output.preview.slice(0, Math.floor(output.preview.length * 0.8));
  return output;
}
