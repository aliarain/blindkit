# The basics

Blindkit uses four names: **Source, Tool, Secret, and Rule**. Here is what each means.

## Source

An app’s API that you connect to Blindkit. An API lets software talk to an app.

You give the source a name, such as `posts`, and an OpenAPI file describing its actions. Blindkit currently accepts OpenAPI 3.0 JSON files. See [Settings](config.md) for the supported formats.

## Tool

One action your AI can use, such as reading a post or creating one. Blindkit creates tools from the OpenAPI file; you do not write them yourself.

Each tool has an address made from the source name and the action’s `operationId`. For example, `posts.getPost` means “use the getPost action from posts.” Its description and input schema tell the AI what the action does and what information it needs.

The `safe` flag is true for GET, HEAD, and OPTIONS requests, which usually read data. This is a default based on the request method, not a guarantee that an action cannot change anything.

## Secret

A private value, such as an API key. Think of it as a password that lets Blindkit use your app.

Your settings hold a reference like `env://MY_API_TOKEN`, never the key itself. This points to an environment variable: a value supplied to Blindkit when it starts. Blindkit reads the key on your computer and adds it to the outgoing request. The AI’s code does not receive it.

Environment variables are the only supported secret source today. Keychain, 1Password, and file references are future ideas.

## Rule

Your choice about whether an action may run:

- `allow`: run without asking.
- `approve`: ask you first, for this specific request.
- `block`: do not run it.

By default, GET, HEAD, and OPTIONS are allowed; other supported methods ask for approval. You can set rules for a whole source or a single tool. A block on either always wins.

Approval appears in your AI app. It applies to one exact request, and the AI cannot approve itself. See [How your AI uses tools](mcp.md) for approval requirements and [Settings](config.md) for rule examples.
