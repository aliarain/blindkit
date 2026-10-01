# Blindkit

**Your agents get tools. The model stays blind to your keys.**

Local-first, open-source MCP gateway. Connect an API once. Every agent gets it through
two tools. Secrets never enter the model or the sandbox. Mutations need a human yes.

## Decisions (locked)
- Name: Blindkit. Domain: blindkit.com
- License: MIT. Public repo from day one
- Stack: TypeScript, Node 22, MCP SDK, QuickJS sandbox, SQLite later
- Local-first: no account, no cloud, no analytics. `npx blindkit` and it works
- Four concepts only: Source, Tool, Secret, Rule.
- One readable config file: `blindkit.json`

## Product commitments
1. Simple setup from a single local config, with no accounts
2. Human confirmation bound to each validated call; no agent-written approval list
3. Audit intent before dispatch, then redacted, bounded arguments and results
4. A small, readable implementation; target under 2,000 runtime source lines
5. Original implementation, product flow, documentation and branding

These are Blindkit's design choices, not claims that other projects lack these features.

## MCP surface (what the server exposes)
Tools
- `search(query, limit?)` find operations across all sources. Returns path, description, input schema, safe/mutating
- `execute(code)` runs JS in the sandbox. Code calls `tools.call(path, args)`. Returns result + logs. No `approve` argument.
- `sources()` list connected sources and tool counts (nice to have)
Later
- Resources: `blindkit://audit/recent`, `blindkit://tools/{path}`
- Prompts: none for v1
- Elicitation: ask user to approve mutating calls
- Transports: stdio first, Streamable HTTP second

## MVP scope
Must ship
- [x] Sandbox: QuickJS, memory + time limits, no fs/net/env, single door `tools.call`
- [x] OpenAPI (JSON) to tools, with $ref resolution
- [x] Secrets via `env://NAME`, resolved host-side only
- [x] Keyword search
- [x] MCP server over stdio with `search` + `execute`
- [x] Rules: GET allowed by default, mutations ask/block, per-tool/source overrides
- [x] Audit log (JSONL), including intent before dispatch
- [x] CLI: `blindkit init`, `blindkit add <spec-url>`, `blindkit serve`
- [x] Smoke test against a real public API
- [ ] README with a 60-second demo GIF

Should ship
- [ ] OpenAPI YAML, Swagger 2.0
- [ ] Better search (BM25)
- [x] Output truncation so huge responses don't eat context
- [ ] Keychain secrets (macOS)

Not in v1
- Teams, cloud, billing, OAuth flows, GraphQL, upstream MCP proxying, web UI

## v2 ideas
GraphQL + upstream MCP servers, OAuth, Streamable HTTP, desktop tray app, secret providers (1Password, keychain)
