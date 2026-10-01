# How it works

Blindkit checks a request before sending it to your app. The AI’s code runs in a limited space called a sandbox. The main Blindkit program handles API keys, rules, approvals, and network requests outside that space.

1. Your AI finds an action and asks to run it.
2. Blindkit checks the input and your rules. If needed, it asks you to approve the exact request.
3. It saves the request to the activity log, adds the API key, and sends it to the app.
4. It removes known secrets from the response, records the result, and returns it to your AI.

The rest of this page is a technical reference for people working on Blindkit’s code.

```text
MCP client --stdio--> search / execute
                              |
                     QuickJS in a worker
                     (empty env; no I/O)
                              |
                    tools.call(path, args)
                              |
                      host-side gateway
                  validate -> rule -> approval
                         -> audit intent
                         -> secrets + HTTP
                         -> redact + audit outcome
                              |
                       sanitized JSON
```

## Modules

| File | Responsibility |
|---|---|
| `types.ts` | The four concepts and strict configuration schemas |
| `config.ts` | Config lookup, exclusive creation, atomic replacement |
| `openapi.ts` | Bounded spec loading, internal references, schema compilation, request preparation |
| `validation.ts`, `validation-worker.ts` | Argument validation in bounded, terminable workers |
| `registry.ts` | Unique tool catalog and deterministic keyword search |
| `policy.ts` | Source/tool rules; explicit blocks dominate |
| `secrets.ts` | Environment references, credential headers, redaction |
| `http.ts` | URL checks, bounded streaming reads and output previews |
| `audit.ts` | Serialized private JSONL writes and sync |
| `gateway.ts` | The only host call path; rules, approvals, audit, and HTTP |
| `sandbox.ts` | Worker lifetime, deadline, cancellation and call budget |
| `sandbox-worker.ts` | QuickJS memory/CPU limits and JSON bridges |
| `server.ts` | The two MCP tools and per-call form elicitation |
| `cli.ts` | `init`, `add`, and `serve` |
| `metadata.ts` | Package version shared by CLI and MCP identity |

## What happens during a run

1. Each `execute` creates a worker with no inherited environment. Only code and limits enter it. At most four runs execute concurrently.
2. QuickJS exposes `tools.call` and `console.log`. Each call serializes arguments as JSON; no host objects or handles cross the boundary.
3. The host resolves the tool and applies policy. A separate worker validates arguments before the host creates a concrete request snapshot. At most four validation workers run at once; queued validation is cancellable. Schema regexes cannot block the host event loop. Unknown/blocked tools never dispatch.
4. For `approve`, the host asks the MCP client to show the method, URL, tool and arguments. Only an accepted form with `confirm: true` permits that one snapshot. No approval override is accepted from agent code.
5. The host writes and syncs audit intent, rechecks cancellation, attaches resolved headers and sends HTTP with redirects disabled. Known credentials require HTTPS except on loopback.
6. Responses are size-limited and redacted before entering QuickJS. Audit outcome includes the same call ID, elapsed time, and a bounded result or safe error.
7. The worker returns a bounded JSON result and logs. On completion/cancellation/deadline, the host aborts pending requests, terminates the worker, and drains host call cleanup.

The 15-second default covers the whole run, including approval and network waits. Owners can raise it to 120 seconds. Termination cannot undo a request already accepted by an API; a run is not a transaction and is never retried automatically.

## Design limits

OpenAPI input is restricted deliberately. External reference resolution cannot read extra local files or fetch arbitrary URLs. The owner must supply trusted specs and base URLs; parsing a spec is a host operation, not sandboxed agent execution.

The SDK's legacy stdio connection supports form elicitation without re-running a program after approval. Modern multi-round-trip approval would need careful continuation handling to avoid replaying earlier mutations; it is deferred.

Workers provide a hard deadline independent of QuickJS's interrupt mechanism. They are not OS process isolation. QuickJS/WASM and Node remain trusted dependencies.

## Implementation conventions

Blindkit uses plain TypeScript and native asynchronous control flow. Modules have concrete jobs; stateful objects own the catalog, credentials, audit queue or execution lifetime. Shared standards determine protocol names, while Blindkit's requirements determine the internal design.

Security decisions use named values and explicit branches. Small named helpers describe meaningful operations, such as scoring a tool or looking up an explicit rule. Avoid nested ternaries, long transformation chains and framework-specific orchestration in the call path. Reference projects are research material, not implementation or style templates.

The working conventions are in [AGENTS.md](../AGENTS.md); formatting is defined in `.prettierrc.json` and checked in CI. Style refactors must preserve the protocol, policy order, approval semantics and security tests.
