import type { Config, Decision, Tool } from './types.js';

export function decide(tool: Tool, policy: Config['policy']): Decision {
  const toolRule = ownRule(policy.tools, tool.path);
  const sourceRule = ownRule(policy.sources, tool.source);

  if (toolRule === 'block' || sourceRule === 'block') {
    return 'block';
  }
  if (toolRule) {
    return toolRule;
  }
  if (sourceRule) {
    return sourceRule;
  }
  if (tool.safe) {
    return 'allow';
  }

  return policy.mutations;
}

function ownRule(rules: Record<string, Decision>, key: string): Decision | undefined {
  // A source name must never resolve to an inherited object property.
  if (Object.hasOwn(rules, key)) {
    return rules[key];
  }
  return undefined;
}
