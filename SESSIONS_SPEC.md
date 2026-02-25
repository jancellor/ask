# Sessions spec

## Concept

A **session** is a persisted record of an agent's message history. Sessions are the primary mechanism for:

- Continuing a conversation across invocations
- Subagent coordination (main agent inspects or continues a subagent's session)
- Parallel speculative execution (fork a session, run multiple subagents, pick the best result)

The term "session" is consistent with Claude Code, Codex, Gemini CLI, and OpenCode.

## Storage

Sessions are stored as JSONL files at:

```
~/.ask/sessions/<uuid>.jsonl
```

Flat structure — no working-directory segment in the path. Session IDs are UUIDs and are globally unique. The working directory at time of each invocation is recorded as metadata inside the file, not in the path.

Sessions are **always written**. There is no opt-in flag to enable persistence.

## Data model

Each line in the JSONL file is a message node:

```ts
type MessageNode = ModelMessage & {
  _meta: {
    id: string;        // UUID, unique per message
    parent?: string;   // explicit parent message ID; if absent, previous line is parent; null for root
    timestamp: string;
    cwd: string;
  }
}
```

The file is **append-only**. Writers acquire a file lock before appending and release it after.

### Linear case (common)

No `parent` field needed — each message's parent is implicitly the previous line. Zero overhead for the common case.

### Branching case

When continuing from a non-terminal point, the new message includes an explicit `parent` pointing to the branch point. Subsequent messages again use implicit parent (previous line). This is analogous to how PGN stores chess games: the main line is linear with branches expressed inline.

```jsonl
{"id": "a1", "parent": null, "role": "user", "content": "..."}
{"id": "a2", "role": "assistant", "content": "..."}
{"id": "a3", "role": "user", "content": "..."}
{"id": "b1", "parent": "a2", "role": "user", "content": "..."}  ← branch from a2
{"id": "b2", "role": "assistant", "content": "..."}              ← implicit parent b1
```

The tree model is primarily useful for interactive branching in the TUI (going back and trying a different approach). Parallel subagent forking uses file copies instead (see below).

## Modes

### Interactive (TUI)

Launches the Ink-based terminal UI. The user types messages in a multi-turn conversation.

```
ask                              # new session, interactive
ask --session <id>               # load session, continue interactively
ask --interactive                # force TUI (overrides auto-detection)
ask --session <id> --interactive # load session, force TUI
```

### Non-interactive (single-shot)

Runs the agent to completion and exits. Final assistant response is written to **stdout** as plain text. Tool calls and progress go to **stderr**.

```
ask "message"                    # new session, single-shot
ask --session <id>               # load session, complete pending response, exit
ask --session <id> "message"     # load session, send message, run to completion, exit
```

If `--session` is given with no message, the agent completes any pending response (i.e. the last message in the session is a user or tool message with no assistant response yet). If there is no pending response, this is a no-op or an error.

### Auto-detection

```
stdin is a TTY and no message provided → interactive
otherwise                              → non-interactive
```

Override with `--interactive` (force TUI) or `--no-interactive` (force single-shot).

## Message argument

A message may be provided as a trailing positional argument:

```
ask "explain this codebase"
ask --session <id> "what did you find?"
```

There is no `-p` / `--print` flag. Whether output goes to stdout vs the TUI is determined by mode, not by how the message is provided.

stdin as a message source is not in scope.

## Session flag

`--session <id>` (shorthand `-s <id>`):

- Loads the session's message history before running
- Appends all new messages to the session file during the run
- Session ID must be a valid UUID

The main agent typically pre-assigns session IDs for subagents:

```bash
SESSION=$(uuidgen)
result=$(ask --session $SESSION "summarise the findings")
# session file exists at ~/.ask/sessions/$SESSION.jsonl for inspection
```

Alternatively the subagent may generate and report its own session ID (mechanism TBD — stdout, stderr, or structured output). The pre-assignment approach is preferred when the caller needs to inspect or continue the session.

## Subagent patterns

### Standard (independent subtasks)

Main agent spawns subagents on fresh sessions. Sessions are linear and independent.

```bash
result=$(ask --session $(uuidgen) "analyse the auth module")
```

### Parallel fork (speculative execution)

Main agent forks its current session into N copies, launches N subagents, inspects results, continues from the best.

```bash
cp ~/.ask/sessions/$MAIN.jsonl ~/.ask/sessions/$FORK_A.jsonl
cp ~/.ask/sessions/$MAIN.jsonl ~/.ask/sessions/$FORK_B.jsonl
ask --session $FORK_A "try approach A" &
ask --session $FORK_B "try approach B" &
wait
# inspect $FORK_A and $FORK_B, pick one, continue
ask --session $FORK_A "looks good, proceed"
```

File copy is the correct primitive here. It is cheap relative to LLM call cost (a 1M-token session file is ~10-30MB; copying takes ~10-50ms on SSD). It avoids concurrent-writer complexity and keeps each subagent as the sole owner of its session file.

### Interactive continuation

Main agent or user loads a subagent's session into the TUI to review and continue interactively.

```bash
ask --session $SUBAGENT_SESSION --interactive
```

## Config

Config is resolved in order of precedence:

1. CLI flags (`--model`, etc.)
2. Environment variables (`ASK_API_KEY`, `ASK_BASE_URL`, `ASK_MODEL`)
3. Config file (`~/.config/ask/config.json`)

The `Agent` class accepts an explicit config object and does not read config itself. Config resolution happens at the entry point (CLI or TUI).

## Flags summary

```
ask [OPTIONS] [MESSAGE]

  --session, -s <id>   Load and continue a session (UUID)
  --interactive        Force TUI mode
  --no-interactive     Force non-interactive mode
  --model <id>         Override configured model
  -h, --help           Show help
```
