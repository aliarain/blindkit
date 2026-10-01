# Vision and principles

## What Blindkit is
A small, readable gateway between agents and the APIs they need. Not a platform. Not a cloud. A tool you install in a minute and trust in an afternoon.

## Who it is for
1. Developers wiring agents to internal and third-party APIs who do not want keys in prompts.
2. Small teams that want one tool catalog every agent shares, with a record of what agents did.
3. Later: larger startups that need self-hosting, audit and policy.

## Principles
1. **Blind by design.** Resolve credential references on the host and redact known values before returning data. Document the limits of redaction honestly.
2. **Local first.** No account, no cloud, no analytics. Everything works offline except the APIs you call.
3. **Four concepts.** Source, Tool, Secret, Rule. Nothing else to learn.
4. **Readable.** Under 2,000 lines. A dev can read all of it in an afternoon and trust it.
5. **Safe by default.** Mutations ask. Limits on time and memory. Full audit trail.
6. **Ship small.** Start with OpenAPI over stdio. Add the rest when users ask.

## Non-goals (v1)
Teams, hosted gateway execution, billing, OAuth flows, GraphQL, proxying other MCP servers, and a gateway management UI. The static marketing and documentation website is separate from the local runtime.

## Independent product decisions

Blindkit starts with a developer's local config file. Connecting an API does not create a workspace, account, daemon, or cloud resource. The product is a small stdio process with a readable call path.

Approval belongs to an exact validated request, not to an agent-written permission list. An audit intent is persisted before dispatch. Unsupported behavior fails explicitly. These are decisions we can explain and test, rather than promises of superiority.

Our code, documentation, names, onboarding, and any future visual identity are original. Reference projects inform questions and tradeoffs; they are not templates to copy or rename. Shared MCP/OpenAPI standards and dependency APIs remain shared standards.

Success means a developer can set up one useful API quickly, understand where its credentials go, see why a call was allowed, and inspect the implementation. Feature count is not the measure.
