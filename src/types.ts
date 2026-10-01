import { z } from 'zod';

export const decisionSchema = z.enum(['allow', 'approve', 'block']);
export type Decision = z.infer<typeof decisionSchema>;
export const sourceSchema = z.strictObject({
  name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/),
  type: z.literal('openapi'),
  spec: z.string().min(1),
  baseUrl: z.url().optional(),
  headers: z.record(z.string(), z.string()).default({}),
});
export const configSchema = z.strictObject({
  sources: z.array(sourceSchema).max(100).default([]),
  policy: z
    .strictObject({
      mutations: decisionSchema.default('approve'),
      sources: z.record(z.string(), decisionSchema).default({}),
      tools: z.record(z.string(), decisionSchema).default({}),
    })
    .default({ mutations: 'approve', sources: {}, tools: {} }),
  limits: z
    .strictObject({
      timeoutMs: z.number().int().min(100).max(120_000).default(15_000),
      memoryMb: z.number().int().min(8).max(128).default(64),
      maxCalls: z.number().int().min(1).max(100).default(25),
      outputBytes: z.number().int().min(1024).max(262_144).default(32_768),
      responseBytes: z.number().int().min(1024).max(10_485_760).default(1_048_576),
    })
    .default({
      timeoutMs: 15_000,
      memoryMb: 64,
      maxCalls: 25,
      outputBytes: 32_768,
      responseBytes: 1_048_576,
    }),
});
export type Config = z.infer<typeof configSchema>;
export type SourceConfig = z.infer<typeof sourceSchema>;
export type Args = Record<string, unknown>;
export interface Tool {
  path: string;
  source: string;
  description: string;
  method: string;
  safe: boolean;
  inputSchema: Record<string, unknown>;
  prepare(args: Args): { url: URL; method: string; body?: string };
}
export type Approval = (
  request: { tool: string; method: string; url: string; args: Args },
  signal: AbortSignal,
) => Promise<boolean>;
export type Execution =
  { ok: true; result: unknown; logs: string[] } | { ok: false; error: string; logs: string[] };
