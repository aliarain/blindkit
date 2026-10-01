# Reference sources (opensrc)

We learn by reading the source of tools we build on or compete with. [opensrc](https://opensrc.sh) fetches any package or repo source into a cache so humans and coding agents can grep it, instead of guessing from types.

## Install
```bash
npm install -g opensrc    # needs Node 18+ and git
```

## Commands
| Command | What it does |
|---|---|
| `opensrc fetch <spec>...` | Download source into the global cache |
| `opensrc path <spec>` | Print the cached path. Fetches on first use |
| `opensrc list` | Show everything cached |
| `opensrc remove <spec>` | Drop one entry |
| `opensrc clean` | Drop all |

Specs: `zod` (npm), `pypi:requests`, `crates:serde`, `owner/repo` (GitHub).
Progress goes to stderr and the path to stdout, so it works in subshells:
```bash
rg "tools.call" $(opensrc path RhysSullivan/executor)
cat $(opensrc path @modelcontextprotocol/sdk)/src/server/index.ts
```

## What we clone
Run `scripts/refs.sh` to fetch all of these and write a path index to `opensrc/REFERENCES.md`.

| Spec | Why |
|---|---|
| `RhysSullivan/executor` | Competitor research only, MIT. The repository now redirects to UsefulSoftwareCo/executor |
| `modelcontextprotocol/typescript-sdk` | The MCP server API we build on |
| `modelcontextprotocol/servers` | Reference MCP servers, patterns for tools and resources |
| `quickjs-emscripten` | Our sandbox engine. Read how async host functions and interrupts work |
| `openapi-typescript` | How others parse and type OpenAPI specs |
| `swagger-api/swagger-parser` | $ref resolution edge cases |
| `zod` | Input validation |
| `@apidevtools/swagger-parser` | Published version used for internal reference resolution |
| `ajv` | Published JSON Schema validation implementation |
| `@modelcontextprotocol/server` | Published MCP server version used by Blindkit |
| `@modelcontextprotocol/client` | Published client used in protocol integration tests |

Add more as needed: any competitor, any dependency we do not understand.

## Reading order for Executor
1. `packages/kernel/runtime-quickjs/src/index.ts` (sandbox)
2. `packages/kernel/core/src/types.ts` (tool shape)
3. `packages/core/execution/src/tool-invoker.ts` (execute flow)
4. `packages/plugins/openapi/src/sdk/extract.ts` and `invoke.ts` (spec to tools, secret injection)
Ignore cloud, desktop, OAuth and the other runtimes for v1.

## Rules
- Reference code is for learning. Do not paste it in. Executor is MIT, so keep their copyright notice if we ever copy a substantial piece.
- The `opensrc/` folder in this repo holds only the index file. The source itself stays in opensrc's cache, out of git.
- Agents working on Blindkit should run `opensrc path <spec>` before guessing how a dependency behaves.

## Review notes — 2026-09-30

Reviewed [executor.sh](https://executor.sh/), its [introduction](https://executor.sh/docs), [self-hosting documentation](https://executor.sh/docs/hosted/docker), [blog index](https://executor.sh/blog/), and [public repository](https://github.com/UsefulSoftwareCo/executor). The complete source snapshot is cached, including `apps/docs`, `apps/marketing`, blog articles under `apps/marketing/src/content/blog`, runtime, plugins, tests and license. The website's machine-readable docs index was unavailable through the browsing tool; the repository contains the documentation source.

Executor already offers local deployment, sandboxing, host-side credentials and approvals. These are shared problem areas, not unique Blindkit features. Blindkit does not claim an overall benchmark or feature advantage. We use references to understand tradeoffs and build original code.

Blindkit's implemented choices are a standalone stdio process, a small owner-edited config, exact per-call approval without model-supplied overrides, audit intent before dispatch, and a deliberately restricted OpenAPI subset. The worker lifetime, limits and error paths have regression tests. No Executor code, assets, marketing copy, or branding was copied.

The SDK's current stable source separates client and server packages. Blindkit uses those published packages and its legacy stdio handshake for form elicitation. See the [official SDK documentation](https://ts.sdk.modelcontextprotocol.io/v2/). Protocol expansion is deferred until approval continuations can avoid replaying earlier mutations.

## Website research — 2026-09-30

Executor's [marketing package](https://github.com/UsefulSoftwareCo/executor/tree/main/apps/marketing) uses Astro with server rendering, React, and the Cloudflare adapter. Its [deployment workflow](https://github.com/UsefulSoftwareCo/executor/blob/main/.github/workflows/deploy.yml) builds the package and publishes with Wrangler. Its [documentation project](https://github.com/UsefulSoftwareCo/executor/tree/main/apps/docs) uses Mintlify, hosted separately and proxied under `/docs`.

Blindkit's `web/` is an original Astro static site with landing and docs routes built together. It uses native browser interactions and plain CSS, and renders the core reference guides from this repository. Cloudflare Workers serves static assets without a server adapter, database, or docs subscription. See the [Workers static-assets guide](https://developers.cloudflare.com/workers/static-assets/get-started/). The wordmark, color palette, page layouts, request walkthrough, and landing copy were written for Blindkit; no competitor assets or components were imported.
