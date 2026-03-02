# Ask

A minimal coding agent.

![Ask screenshot](https://raw.githubusercontent.com/jancellor/ask/main/demo/ask.screenshot.png)

## Why

Ask is a small, working coding agent built as a demo project.
It keeps the setup deliberately minimal: one shell execution tool and
standard CLI utilities (`rg`, `sed`, `cat`, etc.) instead of a large custom tool surface.
It supports AGENTS.md and skills.
The goal is to show the core loop clearly and keep the code easy to read, run, and modify.
It's a proof-of-concept.

Should you use this? Probably not for day-to-day work.
It runs with full shell access, so it needs an external sandbox.
Basic features are missing.
Even so, the core loop works and is useful for real coding tasks.
It should be easy to experiment with different task delegation patterns.
For example, subagents are just self invocations `ask "msg"`.
Usage is controlled by the system prompt.

## Features

- **Single tool.** One `execute` tool runs bash commands. No specialized file-editing, search, or filesystem tools.
- **Interactive and scriptable.** Terminal UI with markdown rendering, or `ask "msg"` for batch mode use.
- **Session persistence.** Conversations are saved as JSONL to `~/.ask/sessions/`.
- **Subagent delegation.** An agent can simply invoke `ask "msg"` to isolate context or run in parallel.
- **Project-level instructions.** `AGENTS.md` files provide project-specific context. `SKILL.md` files describe reusable capabilities.

## Setup

Install from npm:

```bash
npm install -g @jancellor/ask
```

Or build from source:

```bash
git clone https://github.com/jancellor/ask.git
cd ask
npm install
npm run build
npm link
```

Configure a provider:

```bash
ask --config --provider anthropic --model claude-opus-4-6
```

That saves the current config and creates `~/.config/ask/config.json`, eg:

```json
{
  "currentProvider": "anthropic",
  "providers": {
    "anthropic": {
      "currentModel": "claude-opus-4-6"
    }
  }
}
```

Store secrets separately in `~/.config/ask/config.secrets.json`:

```json
{
  "anthropic": {
    "apiKey": "your-api-key"
  }
}
```

For OpenAI-compatible endpoints, configure the provider explicitly:

```json
{
  "currentProvider": "openrouter",
  "providers": {
    "openrouter": {
      "sdkProvider": "openai-compatible",
      "providerOptions": {
        "name": "openrouter",
        "baseURL": "https://openrouter.ai/api/v1"
      },
      "currentModel": "anthropic/claude-sonnet-4.6"
    }
  }
}
```

Ask uses the [AI SDK](https://ai-sdk.dev/docs/reference/ai-sdk-core), and this
config is designed to map directly onto that runtime model. You select a
configured provider, then a model within that provider, and optionally a
variant within that model. A configured provider can also override
[`sdkProvider`](https://ai-sdk.dev/docs/providers) so one named config entry can
target a different SDK provider family, such as `openai-compatible`.
`providerOptions` live on the provider and are passed to the SDK provider
factory, while auth stays separate in `config.secrets.json`. `generateOptions`
can be set globally and at the provider, model, and variant levels; at runtime
they are merged in that order and passed through as the options object for
[`generateText`](https://ai-sdk.dev/docs/ai-sdk-core/generating-text).

For example, you can add a Claude reasoning-effort variant with per-variant
Anthropic options:

```json
{
  "currentProvider": "anthropic",
  "providers": {
    "anthropic": {
      "currentModel": "claude-opus-4-6",
      "models": {
        "claude-opus-4-6": {
          "currentVariant": "balanced",
          "variants": {
            "balanced": {
              "generateOptions": {
                "providerOptions": {
                  "anthropic": {
                    "effort": "medium"
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

Then use `ask -v balanced` to select that variant for a run.

Use `ask -c` to print the resolved config. If you pass `-p`, `-m`, or `-v`
with `-c`, those values are saved as the new current selection. Without `-c`,
they apply only to the current run.

Run:

```bash
ask -c                       # Show current resolved config
ask -c -p openai -m gpt-5    # Update saved provider/model
ask -c -v                    # Clear the saved variant
ask                          # Interactive mode
ask "refactor"               # Batch mode (single positional arg)
cat file.ts | ask "explain"  # Pipe context, ask a question
ask --resume                 # Resume most recent session (interactive)
ask --resume <uuid>          # Resume a specific session
ask --resume -- "refactor"   # Resume most recent session in batch mode
ask --fork                   # Fork most recent session into a new session (interactive)
ask --fork -- "try this"     # Fork most recent session in batch mode
ask --resume <uuid> --fork   # Fork a specific session into a new session
ask --help                   # More options
```

## Architecture

```
User input
  → generateText() via Vercel AI SDK
    → Model returns text + tool calls
      → execute({ command }) — bash -c with timeout
      → stdout/stderr/exit code returned to model
    → Loop until no more tool calls
  → Append messages to session JSONL
```
