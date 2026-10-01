# Agent notes for Blindkit

- Read README.md, then docs/ before changing code. docs/ is the spec.
- Keep the four concepts: Source, Tool, Secret, Rule. Do not add new ones.
- Secrets must never enter the sandbox, logs, or tool output.
- Target under 2,000 lines. Prefer deleting code to adding it.
- Before guessing how a dependency or Executor behaves, run `opensrc path <spec>` (see docs/reference-sources.md) and read the source.

## Blindkit code style

- Write original implementations from Blindkit's requirements. Reference repositories answer research questions; their file layouts, naming patterns and abstractions are not templates.
- Use native TypeScript, `async`/`await`, and ordinary errors. Do not introduce an effect framework, dependency-injection container, or plugin hierarchy without a concrete requirement.
- Use named functions for reusable logic and short arrow callbacks for local transformations. Classes should own state or resource lifetimes; avoid inheritance.
- Write policy, approval and credential decisions as explicit branches. Use braces and early returns. Avoid nested ternaries and positional arrays for decisions.
- Name values after what they contain: `sourceRule`, `parameter`, `secretValue`. Keep abbreviations out of boundary code.
- Keep one responsibility per module. Extract a helper when it names a meaningful operation, not just to wrap another function.
- Add whitespace between methods and phases of a call. Comments explain a constraint or invariant, not the next line.
- Follow `.prettierrc.json`: two spaces, single quotes, semicolons, trailing commas and a 100-column target. Ordinary language/protocol conventions do not need cosmetic renaming to look unique.
- Preserve the public API and security behavior during style refactors. Run `pnpm check`, `pnpm format:check`, and the existing relevant tests.
