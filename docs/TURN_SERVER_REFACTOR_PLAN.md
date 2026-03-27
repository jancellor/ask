# Refactor Plan: Turn Server And Pending Message IDs

This plan breaks the refactor into small steps so each change can land and be
validated independently.

## Goal

Move from the current model:

- `Agent` owns one long-lived `Turn`
- `Agent` owns the append-to-graph flow for each `ask()`
- cancellation is scoped to "current task on this agent"

to the target model:

- each `ask()` creates a new `Turn`
- a `Turn` represents the whole execution record for one in-progress or
  completed continuation
- turns are indexed by `pendingMessageId`
- `pendingMessageId` is the actual future assistant message id
- `Agent` becomes a client-side detached-head convenience wrapper
- an in-process server object owns active turns during the refactor
- a continuation point is always identified by exactly one id:
  either a pending `pendingMessageId` in memory or a complete `messageId` on
  disk

## Constraints

- keep each step small enough to review and adjust before continuing
- prefer changes that move toward the eventual server boundary, even if the
  server is initially only in-process
- avoid changing transport or streaming semantics until the core ownership model
  is stable

## Step 1: Add Pending ID Allocation To MessageGraph

Add a lightweight way for `MessageGraph` to mint a pending assistant message id
before execution starts.

Proposed change:

- add `MessageGraph.pendingId()` that returns a fresh random UUID
- extend `AppendMessageOptions` with optional `lastId?: string`
- if `lastId` is provided, use it for the final appended message
- keep the current random id behavior as the default when no explicit id is
  supplied

Why first:

- `pendingMessageId` must be allocated before execution starts
- the final assistant message must be written using that exact id
- later steps depend on this behavior

Things to watch:

- do not add an expensive duplicate-id validation pass here
- accept that a minted pending id is a best-effort reservation, not a hard
  guarantee enforced up front

## Step 2: Make Turn Own Graph-Based Execution State

Move graph-facing execution responsibilities from `Agent` into `Turn`.

Target responsibility for `Turn`:

- hold `messageGraph`
- hold `parentId`
- hold `pendingMessageId`
- build the initial branch from `parentId`
- append the user prompt
- append intermediate assistant/tool messages
- append the final assistant message using `pendingMessageId`

Likely API direction:

- `Turn` constructor/factory accepts `messageGraph`, config, `parentId`, and
  `pendingMessageId`
- `Turn.ask(prompt, onMessages)` remains the execution entrypoint

Why this step:

- it turns `Turn` into the execution record that a server can expose
- it removes the current mismatch where `Agent` owns execution state and `Turn`
  only owns the model loop

Things to watch:

- preserve current behavior for init prompt insertion
- keep the current message append order and metadata behavior
- decide whether `Turn` stores accumulated appended messages for inspection, or
  reads from `MessageGraph` on demand

## Step 3: Introduce An In-Process TurnManager

Add an in-process server-side object, tentatively `TurnManager`, that owns
active `Turn` instances in memory.

Core model:

- a `Turn` is uniquely identified by its `pendingMessageId`
- that id does not exist in `MessageGraph` while the turn is in progress
- when the turn completes, that same id becomes the final assistant message id
- `TurnManager` removes the turn from memory as soon as `turn.ask(...)` settles

Initial responsibilities:

- create a new turn from a `parentId` and prompt
- allocate a `pendingMessageId`
- create a `ServerTurn`-like instance and store it in a
  `Map<pendingMessageId, Turn>`
- expose lookup by `pendingMessageId`
- expose cancellation by `pendingMessageId`
- remove the turn from the map when `ask()` finishes or fails

Suggested initial API:

- `createTurn(parentId) -> Turn`
- `getTurn(pendingMessageId)`
- `cancelTurn(pendingMessageId)`
- `activeTurns()`

Why this step:

- it creates the server boundary before transport exists
- it locks in the single-id model for in-progress and completed continuation
  points
- it gives later HTTP endpoints a concrete controller-shaped object to target

Things to watch:

- there should be no externally visible "empty turn" state before messages
  begin flowing
- pending ids should be allocated against both active turns and durable graph
  messages as best as practical
- `TurnManager` should not try to persist completed turns; durable state remains
  the message graph

## Step 4: Define Symmetric ClientTurn / ServerTurn APIs

Introduce a shared turn-shaped API that can be implemented both in-process and
over HTTP.

Desired shape:

- `ServerTurn` is the real execution object owned by `TurnManager`
- `ClientTurn` is a transport proxy that mirrors the same surface
- both are identified by `pendingMessageId`

Candidate shared API:

- `pendingMessageId`
- `parentId`
- `messages()`
- `ask(prompt, onMessages?)`
- `cancel()`

HTTP mapping direction:

- `ClientTurn.create(parentId, prompt)` calls something like `POST /leaves`
- the server controller creates a turn via `TurnManager`, starts the ask
  immediately, and returns the `pendingMessageId`
- other turn methods route using that same id

Why this step:

- it lets the client stay unaware of whether it is talking to a local object or
  a remote process
- it makes the later HTTP transport an implementation detail rather than an API
  redesign

Things to watch:

- the HTTP layer should stay thin; `TurnManager` remains the real owner of
  server-side behavior
- `messages()` for a pending turn must include the durable branch prefix plus
  the in-memory suffix accumulated so far

## Step 5: Make Agent Use TurnManager And Pending IDs Directly

Refactor `Agent` toward a detached-head client of the turn manager model.

New `Agent` role:

- hold detached-head state in `_tipId`
- request creation of a new pending leaf from the current tip and prompt
- immediately advance `_tipId` to the new turn's `pendingMessageId`
- watch that leaf's messages through the turn interface
- treat cancellation as targeting the current pending id, not a queue-owned task

Compatibility goal:

- `Agent.ask()` can still return final assistant text for now
- current `useAgent()` behavior should continue to work

Why this step:

- it aligns `Agent` with the "detached head" role described in
  `docs/CORE_CONCEPTS.md`
- it moves routing and cancellation semantics toward the eventual server design

Things to watch:

- queued asks on one `Agent` still need a clear policy
- `TaskQueue` may remain temporarily, but it should become an `Agent` concern,
  not the owner of turn cancellation semantics
- once `_tipId` points at a pending id, `messages()` must still resolve through
  the active turn until completion

## Step 6: Add Continuation-Point Queries Across Memory And Disk

Add a server-level query that lists all potential continuation points, whether
they are still pending in memory or already durable in the message graph.

Likely direction:

- `MessageGraph` computes durable leaves
- `TurnManager` exposes active turns keyed by `pendingMessageId`
- a query layer merges the two into one continuation-point list

Candidate response shape:

- `messageId`
- `state: 'pending' | 'complete'`
- `parentId`
- `messages`

Why here:

- this is one of the main motivations for the architecture
- it exercises the single-id model directly

Things to watch:

- avoid double-counting if a turn finishes during listing
- `messages` for pending turns come from the active turn's mixed
  durable-prefix/in-memory-suffix view
- `messages` for complete turns come from `MessageGraph`

## Step 7: Revisit Streaming / Subscription API

Only after the ownership model is stable, reconsider whether `onMessages`
callbacks should become a stream or `AsyncIterable`.

Current recommendation:

- keep callback-based delivery during the refactor
- treat streaming shape as a transport/interface decision, not a prerequisite
  for the server architecture

Questions to revisit later:

- should a `Turn` expose a subscription API directly?
- should server clients consume events as callbacks, iterables, or a push stream?
- what is the cleanest mapping to HTTP/SSE/WebSocket transport?

## Open Questions

- where should init prompt insertion ultimately live: `TurnManager`, `Turn`, or
  a higher-level conversation/head abstraction?
- what sequencing guarantees should one `Agent` provide if multiple `ask()`
  calls are issued quickly?
- do we want one private in-process manager per `Agent` during the transition,
  or should multiple agents share one process-local manager sooner?

## Recommended Execution Order

1. implement Step 1
2. implement Step 2
3. implement Step 3
4. implement Step 4
5. implement Step 5
6. implement Step 6
7. stop and re-evaluate streaming
8. revisit Step 7 only if needed
