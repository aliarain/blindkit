# Security

Blindkit keeps configured API keys out of the AI’s code, checks your rules before calling an app, and asks for approval when a rule requires it. It also limits how long code can run and how many requests it can make.

This is an early release. Automated security tests pass, but there has been no independent security review. Start with the example API and data you can afford to lose.

## Before connecting an app

- Only connect APIs and AI apps you trust. The AI app is responsible for showing approval forms and reporting your answer.
- Store API keys through `env://` references. Keep actual keys out of settings files, API descriptions, and AI conversations.
- Review which actions are allowed. Some actions that look like reads can change data.
- Approval gives permission to send one request; it cannot undo a change already accepted by an app.
- The activity log can contain private app data even after known keys are removed. Keep that file private.

The sections below describe the controls and their limits in detail.

## How protection works

| Threat | Implemented control |
|---|---|
| Agent reads host files/environment/network | QuickJS exposes none; worker has an empty environment |
| Agent calls an arbitrary URL | Only registered operations cross the host bridge; arguments cannot replace the configured origin |
| Agent authorizes its own mutation | No `approve` input; accepted client form required for every call needing approval |
| Agent changes arguments after approval | Host snapshots validated URL/body and displays the corresponding args before approval |
| Credential forwarded by redirect | All request and spec redirects disabled |
| Plaintext credential transport | HTTPS required for configured environment credentials outside loopback |
| Secret returned by an echo API | Configured values plus URL/base64 forms redacted before QuickJS; common sensitive keys masked |
| Infinite loop or memory exhaustion | QuickJS limits and an independently terminable worker; parent wall-clock deadline |
| Schema regex consumes unbounded CPU for agent arguments | Argument validation runs in capped, terminable workers within the run deadline; async schemas are rejected |
| Huge response or call flood | Bounded streaming reads, output/log limits, call budget and concurrency cap |
| Calls without audit intent | Intent must be synced before dispatch; audit failure stops dispatch |
| Audit target is a symlink or FIFO | No-follow/nonblocking open and regular-file check before writing |
| `$ref` reads local files or other URLs | Only internal acyclic references accepted |

## What you still need to trust

- Config, specs, the MCP client, host OS, Node, QuickJS/WASM and dependencies are trusted. A client can falsely claim a human approved; Blindkit relies on the host's UI. An actor who can edit local config/code can bypass these rules.
- Configured APIs and base URLs are explicitly trusted destinations, including private networks. No DNS pinning or IP allowlist is implemented. Pin a local spec rather than following a mutable remote one for sensitive APIs.
- Secrets are resolved on the host. Exact configured values and several common representations are scrubbed, but novel encodings, unknown credentials, partial values and arbitrary sensitive business data cannot all be detected. Redaction may over-mask data, especially with short values.
- Use `env://` for every header that carries an API key or other secret. Secrets should not appear in spec descriptions/defaults, config URLs or literal custom headers. The environment remains readable by the host process and OS-level peers with sufficient privileges.
- HTTP safety defaults are a heuristic. Some GETs mutate and some POSTs only read; apply explicit rules for those operations. Owners can deliberately allow mutations in config.
- A cancelled or timed-out request may already have changed data in your app. A failed run does not undo that change. Blindkit does not retry automatically. Finishing requests and saving the log may continue after the code’s time limit.
- Audit records contain redacted args/results and may retain personal or business data. They are private local files, not encrypted or tamper-evident. No rotation is provided. Outcome-write failure after dispatch is reported as an uncertain result.
- Specs and JSON schemas are parsed/compiled on the host at startup. Only import trusted, reasonably sized specs; the 5 MB input cap does not bound all parsing/validation CPU costs.
- Worker threads isolate lifetime and environment, not the OS process. A vulnerability in the engine or its bindings remains a risk.
- API responses and descriptions can contain misleading instructions aimed at the AI (prompt injection). Approval and rules limit actions, but they cannot make the returned content trustworthy.

## Reporting

Report vulnerabilities privately to **realaliarain@gmail.com**. Include the affected version, reproduction steps, and expected versus actual behavior, using synthetic credentials. Do not post real credentials or exploit details in public issues.

This project has automated regression tests and an internal code review. These do not constitute an independent security audit or guarantee that all vulnerabilities have been found.
