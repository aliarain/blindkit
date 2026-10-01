# Blindkit

**Your AI. Your apps. Your rules.**

Blindkit connects your AI assistant to your apps. It runs on your computer, adds API keys outside the AI’s code, and asks for approval before changes by default.

Connect an app using an OpenAPI file describing its actions. Your AI finds an action with `search` and runs it with `execute`, using MCP, the standard for connecting AI to tools.

Status: v0.1 alpha, not yet published to npm or independently security audited. Use a current patched Node 22 or 24 release; pnpm 10 is required to develop it. MIT licensed.

No database, Redis, Docker, or cloud account is required. Blindkit stores configuration and audit records in local files. You need an MCP client for agent use, access to the APIs you configure, and their credentials when authentication is required. Approval-required calls need a client with MCP form elicitation support.

## Run from source

Run these commands from this `blindkit/` directory:

```bash
pnpm install --frozen-lockfile
pnpm build
node dist/cli.js init
node dist/cli.js add examples/posts.openapi.json --name posts
```

Add to your MCP client, replacing both absolute paths:

```json
{
  "mcpServers": {
    "blindkit": {
      "command": "node",
      "args": ["/absolute/path/blindkit/dist/cli.js", "serve", "--config", "/absolute/path/blindkit/blindkit.json"]
    }
  }
}
```

Ask the agent to search for `getPost`, then execute:

```js
const post = await tools.call("posts.getPost", { id: 1 });
return { title: post.title };
```

The bundled spec uses JSONPlaceholder, a public demo API. Its write operation is simulated and still requires approval. `pnpm smoke` exercises only a public GET through the real stdio server.

For an authenticated API, edit the source's `headers` in `blindkit.json`:

```json
{ "Authorization": "Bearer env://MY_API_TOKEN" }
```

Supply `MY_API_TOKEN` in the server process environment using your client's configuration. Do not paste the actual token into an agent conversation or the config. Credentials require HTTPS outside loopback.

## What is implemented

- Exactly two MCP tools, regardless of catalog size.
- QuickJS inside a terminable worker with an empty environment; no network, filesystem, imports, or process APIs exposed to agent code.
- Host-side argument validation, secret resolution, and HTTP requests; redirects disabled.
- Per-source and per-tool rules. Source/tool blocks win. Approval is for one exact call; agent-provided approvals are rejected.
- Redaction of configured secret values and common sensitive response keys before data reaches the sandbox, logs, or MCP output.
- A local JSONL audit trail with an intent record before dispatch and an outcome afterward. Failure to write intent blocks dispatch.
- Memory, time, call count, response size, output, and concurrency limits.

The MCP connection uses the 2025 stdio handshake and form elicitation. Clients without form elicitation can read but cannot perform calls requiring approval. Newer multi-round-trip MCP approvals and HTTP transport are future work.

## Deliberate boundaries

v0.1 accepts OpenAPI 3.0 JSON, local references, scalar path/query parameters, query arrays, and JSON request bodies. External/circular references, OpenAPI 3.1, YAML, header/cookie parameters, multipart, OAuth, GraphQL, and upstream MCP proxying are rejected or unsupported. Bundle and simplify specs before importing them. Configure credentials through source headers.

Read the [security model](docs/security.md) before connecting sensitive APIs. Config and specs are trusted owner input. HTTP methods are only a heuristic for safety, an accepted request cannot be rolled back, and redaction cannot identify every unknown or transformed secret.

## Develop

```bash
pnpm check
pnpm format:check
pnpm test
pnpm package:check # clean production install and end-to-end checks; requires internet
pnpm smoke  # optional; requires internet
```

Tests cover sandbox isolation and resource limits, approval enforcement over MCP, credential handling, audit failures, redirects, reference restrictions, and CLI setup. Raw JSON-RPC tests exercise three 2025 protocol versions independently of the client SDK. CI checks Node 22 and 24 on Linux and macOS, including a clean tarball installation. Desktop client approval interfaces still need compatibility testing.

## Website and documentation

The independent static website lives in `web/`. It builds the landing page and `/docs/` together; reference guides render directly from this repository's Markdown. The website does not run the MCP gateway or handle API credentials.

```bash
pnpm --dir web install --frozen-lockfile
pnpm web:dev      # http://127.0.0.1:4321
pnpm web:build
pnpm web:check
```

For a local production preview, run `pnpm --dir web preview`.

### Publish on Vercel

The root `vercel.json` builds the website and checks its pages and links before deployment. Connect this repository to Vercel with the repository root as the project root. It installs only the website dependencies and publishes `web/dist`; no database, server adapter, or custom domain is needed.

Vercel production builds use the project's production address for canonical URLs and the sitemap. Preview deployments are marked `noindex`. Set `SITE_URL` to an HTTPS origin to choose another public address outside Vercel.

### Optional Cloudflare deployment

`web/wrangler.jsonc` also supports Cloudflare Workers static assets. Run `pnpm --dir web deploy:check` to check the upload without publishing, or `pnpm --dir web deploy` to publish using an authenticated Cloudflare account. The manual `Deploy website to Cloudflare (optional)` workflow needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. Set the `SITE_URL` repository variable to the public address for that deployment.

## Design and references

[Vision](docs/vision.md) · [Concepts](docs/concepts.md) · [Architecture](docs/architecture.md) · [MCP](docs/mcp.md) · [Config](docs/config.md) · [Security](docs/security.md) · [Roadmap](docs/roadmap.md) · [Reference sources](docs/reference-sources.md)

Executor is an inspiration and competitor, not a code template. Our focus is a compact implementation with explicit boundaries that a developer can inspect. We do not claim overall superiority or feature parity. Reference sources live outside this project; their local paths are in [opensrc/REFERENCES.md](opensrc/REFERENCES.md).
