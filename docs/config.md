# Settings

Your `blindkit.json` file lists the apps you connect, the rules for their actions, and the limits on each run. Restart Blindkit after changing it.

Use `--config path` to choose a file. Otherwise Blindkit looks for `./blindkit.json`, then `~/.blindkit/config.json`. If it finds an invalid file, it stops instead of trying another. File paths in your settings are relative to that settings file; the `add` command saves full paths.

In this example, most actions ask first. Reading a profile is allowed, and deleting an account is blocked. `env://API_TOKEN` points to a key supplied through an environment variable; it is not the key itself.

```json
{
  "sources": [{
    "name": "internal",
    "type": "openapi",
    "spec": "./api.openapi.json",
    "baseUrl": "https://api.example.com/v1",
    "headers": { "Authorization": "Bearer env://API_TOKEN" }
  }],
  "policy": {
    "mutations": "approve",
    "sources": { "internal": "approve" },
    "tools": { "internal.deleteAccount": "block", "internal.getProfile": "allow" }
  },
  "limits": { "timeoutMs": 60000 }
}
```

## Connect an app

`name`, `type: "openapi"`, and `spec` are required. Names must start with a letter and contain only letters, digits, `_`, or `-`; names and operation paths must be unique. `baseUrl` defaults to the first spec server. Set it explicitly for relative/variable/per-operation servers. Only HTTP(S) is accepted, with no embedded credentials, fragments or base queries.

`headers` holds extra values sent with requests, such as API key references. It defaults to `{}`. Use `env://NAME` for every secret, including custom headers. Blindkit reads the named environment variable on each call. A missing or empty value stops the request. Authorization, cookie, and API-key headers require these references. Keep actual keys out of this file.

### Supported OpenAPI files

Specs are OpenAPI 3.0 JSON, at most 5 MB. Remote specs have a 15-second timeout and cannot redirect. A `$ref` can point to another part of the same file, but references must not form a loop. References to other files or URLs are rejected. Path/query parameters accept scalars, and query arrays support `form` serialization. Bodies use `application/json`. Header/cookie parameters, multipart, deep-object parameters, YAML and OpenAPI 3.1 are not supported yet. Unsupported operations fail the import instead of silently changing their meaning.

## Choose your rules

Use `allow` to run without asking, `approve` to ask you first, or `block` to stop the action. `mutations` means requests that may change data.

When more than one rule applies, Blindkit checks them in this order:

1. An explicit tool or source `block` wins.
2. An explicit tool rule wins over a non-blocking source rule.
3. Otherwise use the source rule.
4. Otherwise GET, HEAD, OPTIONS allow; other supported methods use `mutations` (default `approve`).

Some APIs use GET requests to change data. Set those actions to `approve` or `block` yourself; the request method alone cannot prove that an action is safe. Restart Blindkit after editing rules.

## Set limits

Each run has a time limit, a memory limit, and a limit on how many requests it can make. Time is in milliseconds: `15000` means 15 seconds. Waiting for your approval counts toward this time.

| Field | Default | Range |
|---|---|---|
| `timeoutMs` | 15000 | 100–120000, includes approval time |
| `memoryMb` | 64 | 8–128, QuickJS heap |
| `maxCalls` | 25 | 1–100 per execution |
| `outputBytes` | 32768 | 1024–262144 for result/catalog JSON |
| `responseBytes` | 1048576 | 1024–10485760 per API response |

Additional fixed limits: four concurrent runs, four concurrent argument-validation workers, 64 KB code, 32 KB call arguments, 100 log entries with an 8 KB text budget, and 12 KB approval prompts. Queued validation counts toward the run deadline and is cancelled with the run. Audit fields are bounded to 8 KB. Total process/worker memory is larger than the QuickJS heap limit.

## Activity log

The activity log, also called the audit log, records each request before it is sent and its result afterward. By default it is saved at `~/.blindkit/audit.jsonl`; override with `serve --audit path`. Only the file owner can read and write newly created log files (`0600`); new parent folders are owner-only (`0700`). The target must be a regular file and cannot itself be a symlink. Each line is a JSON record (JSONL). Known secrets are removed before writing. Records are saved to disk with a call ID and `started`, `succeeded`, `blocked`, or `failed-after-dispatch` status. A `started` record without an outcome means the result is unknown, not that the API did nothing.

Audit records include arguments and bounded results, so they can contain private business data. Old records are not removed automatically, and the log cannot prove that nobody edited it.
