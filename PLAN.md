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
- build the initial thread from `parentId`
- append the user prompt
- append intermediate assistant/tool messages
- append the final assistant message using `pendingMessageId`

Likely API direction:

- `Turn` constructor/factory accepts `messageGraph`, config, `parentId`, and
  `pendingMessageId`
- `Turn.ask(prompt, onMessages)` remains the execution entrypoint
- `Turn.ask()` builds its own initial thread from `parentId`

Why this step:

- it turns `Turn` into the execution record that a server can expose
- it removes the current mismatch where `Agent` owns execution state and `Turn`
  only owns the model loop

Things to watch:

- preserve current behavior for init prompt insertion
- keep the current message append order and metadata behavior
- decide whether `Turn` stores accumulated appended messages for inspection, or
  reads from `MessageGraph` on demand

## Step 3: Introduce An In-Process TurnServer

Add a server-like object that owns active turns for the lifetime of an `Agent`
at first.

Initial responsibilities:

- create a new turn from a `parentId`
- allocate a `pendingMessageId`
- register the turn in a `Map<pendingMessageId, Turn>`
- start execution
- expose lookup by `pendingMessageId`
- expose cancellation by `pendingMessageId`
- remove turns from the active map when they finish, or keep them available if
  that proves more useful during the refactor

Suggested initial API:

- `createTurn({ parentId, prompt, onMessages? })`
- `getTurn(pendingMessageId)`
- `listActiveTurns()`
- `cancelTurn(pendingMessageId)`

Return shape from `createTurn()`:

- `{ pendingMessageId, turn, result }`

where:

- `pendingMessageId` is returned immediately
- `turn` is the execution record
- `result` is the eventual completion promise from `turn.ask(...)`

Why this step:

- it creates the architectural seam before introducing a separate process or
  socket transport
- it makes turn ownership explicit

Things to watch:

- define whether completed turns remain queryable from the server or are derived
  only from the graph on disk
- keep the public surface narrow so transport can be layered on later

## Step 4: Make Agent A Detached-Head Client Of TurnServer

Refactor `Agent` so it stops owning a long-lived `Turn`.

New `Agent` role:

- hold detached-head state in `_tipId`
- hold an in-process `TurnServer`
- on `ask(prompt)`, request a new turn from the server using the current tip
- immediately advance `_tipId` to the returned `pendingMessageId`
- keep `messages()` and `messageTree()` as graph-derived views rooted at the
  current tip

Likely behavior change:

- `Agent.ask()` may still return the final assistant text for compatibility
- internally it should receive `pendingMessageId` immediately from the server
- cancellation should move away from "cancel current" toward "cancel by pending
  message id"

Why this step:

- it preserves `Agent` as the client-side detached-head abstraction discussed in
  `docs/CORE_CONCEPTS.md`
- it removes the current conflation between conversation handle and execution
  owner

Things to watch:

- compatibility with current `useAgent()` code
- when `onMessages` fires relative to immediate tip advancement

## Step 5: Rework Cancellation Around Pending Message IDs

Replace or de-emphasize `TaskQueue`'s current "current task" model.

Desired direction:

- cancellation targets a specific `pendingMessageId`
- server resolves that id to a `Turn`
- turn aborts its execution controller

Possible transitional approach:

- keep `cancelCurrent()` on `Agent` temporarily as a thin wrapper around the
  most recently created pending id
- add a more explicit `cancel(messageId)` API

Why after Step 4:

- once turns are server-owned, the current queue abstraction can be evaluated in
  the right context
- this reduces the risk of refactoring cancellation twice

Things to watch:

- queued asks on one `Agent` may still need local sequencing semantics
- decide whether sequencing belongs in `Agent`, `TurnServer`, or a separate
  abstraction

## Step 6: Add Leaf Queries Combining In-Progress And Durable State

Add a server-level query that can return:

- in-progress leaves from active turns
- durable leaves derived from the message graph on disk

Likely direction:

- `MessageGraph` computes durable leaves
- `TurnServer` merges active turns with durable graph state

Why here:

- this is one of the main motivations for the architecture
- it depends on turns already being server-owned and indexed by pending message
  id

Things to watch:

- avoid double-counting a turn whose final message has already been persisted
- define whether active turns should appear as leaves even before any messages
  beyond the user prompt are written

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

- should completed turns remain queryable directly from `TurnServer`, or should
  the server only track active turns and derive completed state from
  `MessageGraph`?
- where should init prompt insertion ultimately live: `TurnServer`, `Turn`, or a
  higher-level conversation/head abstraction?
- what sequencing guarantees should one `Agent` provide if multiple `ask()`
  calls are issued quickly?
- do we want one private in-process server per `Agent` during the transition, or
  should multiple agents share one process-local server sooner?

## Recommended Execution Order

1. implement Step 1
2. implement Step 2
3. implement Step 3
4. implement Step 4
5. stop and re-evaluate cancellation semantics
6. implement Step 5
7. implement Step 6
8. revisit Step 7 only if needed
