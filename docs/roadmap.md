# Roadmap

## v0.1 foundation (implemented locally)
- [x] QuickJS sandbox with limits
- [x] OpenAPI (JSON) to tools, $ref resolution
- [x] `env://` secrets
- [x] Keyword search
- [x] MCP server over stdio: `search`, `execute`
- [x] Rules: allow, approve, block, per-source and per-tool overrides
- [x] Per-call human approval through MCP form elicitation; no agent override
- [x] Audit intent before dispatch and outcome afterward (JSONL)
- [x] CLI: init, add, serve
- [x] Smoke test against a real public API (read-only, through MCP)
- [x] Regression tests for security boundaries and CLI/MCP integration
- [x] Independent MIT implementation and CI workflow
- [x] Static landing page and documentation package in `web/`
- [x] Publish website at https://blindkit.vercel.app with GitHub connected to Vercel
- [ ] Connect an owned domain
- [ ] README demo GIF

## v0.2 candidates (prioritize from actual use)
- OpenAPI 3.1, YAML, broader parameter/body support
- BM25 search
- Audit rotation and configurable result retention
- macOS keychain secrets
- More complete secret redaction

## v0.3
- Streamable HTTP transport
- Modern MCP multi-round-trip approval without replaying mutations
- `sources` tool, audit resource

## Later
GraphQL, proxy upstream MCP servers, OAuth, 1Password, desktop tray app, optional hosted sync for teams (only if users ask).

## Launch checklist
- [ ] Buy blindkit.com (+ .dev)
- [x] Publish GitHub repository: https://github.com/aliarain/blindkit
- [ ] Publish npm package and reserve X handle
- [ ] Trademark sanity check on "Blindkit"
- [x] Cache the seven original reference sources and inspect dependency implementations
- [ ] Independent security review and broader client compatibility testing
- [x] Security contact in docs/security.md
- [ ] Show HN + X thread

## Kill rule
If 2 weeks after launch there is no real usage or feedback, stop and move on.
