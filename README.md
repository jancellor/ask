# Gent

A minimal coding agent in a few thousand lines of TypeScript.

https://github.com/jancellor/gent/raw/main/demo/demo.mp4

## Why

Gent is a small, working coding agent built as a demo project.
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
For example, subagents are just self invocations `gent -p`.
Usage is controlled by the system prompt.

## Features

- **Single tool.** One `execute` tool runs bash commands. No specialized file-editing, search, or filesystem tools.
- **Interactive and scriptable.** Terminal UI with markdown rendering and streaming output, or `gent -p "..."` for non-interactive use.
- **Session persistence.** Conversations are saved as JSONL to `.gent/sessions/`.
- **Subagent delegation.** An agent can simply invoke `gent -p "..."` to isolate context or run in parallel.  
- **Project-level instructions.** `AGENTS.md` files provide project-specific context. `SKILL.md` files describe reusable capabilities.

## Setup

```bash
git clone https://github.com/jancellor/gent.git
cd gent
bun install
bun link
# npm/node should work if you update the bin shebang
```

Configure a provider:

```bash
export GENT_API_KEY="your-api-key"
export GENT_MODEL="anthropic/claude-sonnet-4.6"
export GENT_BASE_URL="https://openrouter.ai/api/v1"
```

Or create `~/.config/gent/config.json`:

```json
{
  "api_key": "your-api-key",
  "model": "anthropic/claude-sonnet-4.6",
  "base_url": "https://openrouter.ai/api/v1"
}
```

Run:

```bash
gent                 # Interactive
gent -p "prompt"     # Non-interactive
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
