import { loadSource } from './openapi.js';
import type { Config, Tool } from './types.js';

export class Registry {
  readonly tools = new Map<string, Tool>();

  static async load(config: Config, directory: string): Promise<Registry> {
    const registry = new Registry();
    const names = new Set<string>();
    for (const source of config.sources) {
      if (names.has(source.name)) {
        throw new Error(`Duplicate source: ${source.name}`);
      }
      names.add(source.name);
      for (const tool of await loadSource(source, directory)) {
        if (registry.tools.has(tool.path)) {
          throw new Error(`Duplicate tool: ${tool.path}`);
        }
        registry.tools.set(tool.path, tool);
      }
    }
    return registry;
  }

  search(query: string, limit = 10) {
    const terms = query.toLowerCase().match(/[a-z0-9_-]+/g) ?? [];
    const matches: { tool: Tool; score: number }[] = [];

    for (const tool of this.tools.values()) {
      const score = scoreTool(tool, terms);
      if (terms.length === 0 || score > 0) {
        matches.push({ tool, score });
      }
    }

    matches.sort((left, right) => {
      const byScore = right.score - left.score;
      return byScore || left.tool.path.localeCompare(right.tool.path);
    });

    const resultLimit = Math.max(1, Math.min(25, limit));
    return matches.slice(0, resultLimit).map(({ tool }) => describeTool(tool));
  }
}

function scoreTool(tool: Tool, terms: string[]): number {
  const path = tool.path.toLowerCase();
  const description = tool.description.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (path.includes(term)) {
      score += 4;
    }
    if (description.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function describeTool(tool: Tool) {
  const { path, description, method, safe, inputSchema } = tool;
  return { path, description, method, safe, inputSchema };
}
