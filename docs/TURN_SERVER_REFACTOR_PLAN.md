# Refactor Plan: Leaf-First Server Alignment

This plan updates the older turn-server refactor notes so they match
[`docs/SERVER_SPEC.md`](./SERVER_SPEC.md), which should be treated as the more
authoritative design.

The key correction is:

- `Turn` may still exist internally as execution machinery
- but the public server model is a `leaf`, not a `turn`
- and pending + complete continuation points must share one id

The steps below aim to move the codebase toward that model in reviewable
increments.

## Goal

Move from the current model:

- `Agent` owns one long-lived detached head and constructs `Turn` directly
- `Agent` owns most ask lifecycle and cancellation behavior
- durable graph writes and in-memory execution are tightly coupled
- pending work is not represented as a first-class leaf identity

to the target model:

- each new ask creates and starts one pending leaf immediately
- the pending leaf id is the exact future final assistant `messageId`
- active in-memory execution is owned by a server-side controller
- completed state remains durable only in `MessageGraph`
- clients interact with leaves plus graph-level message reads, not public turn
  objects
- `Agent` becomes a leaf-following detached-head client convenience wrapper

## Constraints

- keep each step small enough to review and adjust before continuing
- prefer changes that move toward the eventual server boundary even if the
  server is initially only in-process
- preserve current behavior unless the spec explicitly requires a change
- do not introduce a second durable store for completed turns or leaves

## Guiding Model

The model from the server spec should be treated as canonical:

- a complete leaf is a durable message-graph leaf
- a pending leaf is an in-progress continuation that exists only in memory
- the pending leaf id is reserved up front and becomes the final assistant
  message id on success
- the public API is leaf-first
- creating a pending leaf and starting its first ask are one operation

Implication:

- `Turn` is now an internal implementation detail unless and until a strong
  reason appears to expose it

## Step 1: Finish And Confirm Pending Final-Message IDs

Ensure `MessageGraph` supports the single-id model required by the spec.

Required behavior:

- mint a fresh id before execution starts
- allow the final appended assistant message to use that exact id
- keep the existing default behavior for intermediate appended messages

Likely code shape:

- keep `MessageGraph.pendingId()`
- keep `AppendMessageOptions.lastId?: string`
- use `lastId` only for the final appended message in a batch

Why first:

- every later step depends on the ability to reserve the future leaf id

Things to watch:

- duplicate-id validation can remain best-effort rather than globally locked
- a reserved id is only meaningful relative to active in-memory leaves and
  current durable graph contents

## Step 2: Make Turn A Server-Owned Execution Object

Refactor `Turn` so it owns one ask execution record, but keep it internal.

Target responsibility for `Turn`:

- hold `messageGraph`
- hold starting `parentId`
- hold `pendingLeafId`
- run model/tool execution for exactly one ask
- append the prompt, intermediate messages, and final assistant message
- write the final assistant message using `pendingLeafId`

Non-goal:

- do not make `Turn` the public conceptual model

Likely API direction:

- `Turn.create({ messageGraph, config, parentId, pendingLeafId, ... })`
- `turn.run(prompt, onMessages?)`
- `turn.cancel()`

Why this step:

- server-owned execution still needs a concrete object
- today that responsibility is split awkwardly between `Agent` and `Turn`

Things to watch:

- preserve init prompt behavior
- preserve current append order and metadata semantics
- decide explicitly which state must remain inspectable while the turn is still
  active in memory

## Step 3: Introduce An In-Process Leaf Manager

Add an in-process server-side controller, tentatively `TurnManager`, though
`LeafManager` may be a better eventual name because the public API is leaf-first.

Core responsibilities:

- allocate pending leaf ids
- create and own active in-memory execution objects
- index active pending leaves by `leafId`
- cancel active pending leaves
- remove settled leaves from memory

Required lifecycle:

- `createLeaf(parentId, prompt)` allocates a pending leaf id and starts
  execution immediately
- while active, that leaf exists only in memory
- on success, that same id becomes durable in `MessageGraph`
- on cancellation or failure before durable completion, the pending leaf
  disappears from the live leaf set

Suggested initial API:

- `createLeaf(parentId, prompt) -> { leafId }`
- `getActiveLeaf(leafId)`
- `cancelLeaf(leafId)`
- `activeLeaves()`

Why this step:

- it creates the actual server ownership boundary described in the spec
- it removes the public empty-turn concept from the architecture

Things to watch:

- there should be no externally visible "created but not started" state
- the manager must not persist completed turns separately from the graph
- name choice matters: if `TurnManager` remains the class name, keep the docs
  clear that "turn" is internal only

## Step 4: Define The Server-Side Leaf View

Add the query layer that merges durable graph leaves with active pending leaves
into one live leaf model.

This is the main read model the server spec expects.

Required behavior:

- list durable leaves from `MessageGraph`
- overlay active pending leaves from the in-memory manager
- expose each continuation point by exactly one id
- avoid double-counting during completion races

Preferred payload shape for this layer:

- `leafId`
- `parentId`

Not preferred at this layer unless needed internally:

- explicit `state: 'pending' | 'complete'`
- full `messages`
- extra metadata that duplicates what the graph/manager already imply

Why here:

- the spec’s public model is "the global leaf set", not "lookup turns"

Things to watch:

- completion races need a clear rule: memory view disappears as durable graph
  view appears under the same id
- keep the leaf list minimal and structural

## Step 5: Add Graph Message Resolution Across Memory And Disk

Implement the mixed message view as a graph-level operation.

Required behavior from the spec:

- for a durable complete leaf, messages come from `MessageGraph`
- for an active pending leaf, messages are:
  durable branch prefix + in-memory suffix accumulated so far
- the same target id must work in both states

Likely API direction:

- `messageGraph.messages({ toMessageId, afterMessageId? })`
- reject `afterMessageId` if it is not on the path to `toMessageId`
- optionally add `leaf.messages({ afterMessageId })` later as thin convenience
  sugar over the graph call

Why this step:

- it exercises the single-id model directly
- it gives the client a stable way to follow a branch even as a leaf moves from
  pending to durable
- it avoids baking "messages belong to leaves" too deeply into the core model

Things to watch:

- the mixed view should not require the caller to know whether the target id is
  pending or complete
- the branch is complete once the stream emits the message whose id equals the
  requested `toMessageId`
- leaf-level message methods should remain convenience wrappers, not the core
  primitive

## Step 6: Refactor Agent Into A Leaf-Following Client

Refactor `Agent` so it behaves like a detached-head client over leaf ids rather
than the owner of execution.

New `Agent` role:

- hold detached-head state in `_tipId`
- request `createLeaf(parentId, prompt)` from the manager/server
- immediately advance `_tipId` to the new pending leaf id
- resolve `messages()` through the graph message view targeted at the current
  tip id
- target cancellation by leaf id rather than by queue-owned current task

Compatibility goal:

- `Agent.ask()` may still return final assistant text for now
- existing UI hooks such as `useAgent()` should continue to function during the
  transition

Why this step:

- it aligns the implementation with the server spec and the detached-head model

Things to watch:

- if `TaskQueue` remains temporarily, it should only express local sequencing
  policy for one agent, not server truth
- once `_tipId` points at a pending leaf, `messages()` must still work

## Step 7: Introduce Stream-First Server Endpoints

Once the ownership and query model is correct in-process, add the actual
stream-first server API from the spec.

Target endpoints:

- `POST /leaves`
- `DELETE /leaves/:leafId`
- `GET /leaves`
- `GET /leaves/:leafId/messages`
- optionally later a more general `GET /messages?toMessageId=...&afterMessageId=...`

Expected event model:

- leaf stream replays existing leaves as `added`
- then emits `added` / `removed` as the live leaf set changes
- message stream replays existing branch messages as `added`
- then emits new `added` events for in-progress leaves as messages arrive

Why this step is later:

- transport should sit on top of the correct ownership model
- otherwise the HTTP surface will harden the wrong abstractions

Things to watch:

- keep the HTTP layer thin; manager/query objects remain the real owner of
  behavior
- do not split initial read and realtime subscription unless experience later
  proves the stream-first design inadequate

## Step 8: Add Pending Leaf Dependency Semantics

Implement the pending-on-pending rules from the spec once the base leaf model
exists.

Required behavior:

- a pending leaf may use another pending leaf as its `parentId`
- child pending leaves are visible in the live leaf set
- a child pending leaf must not begin execution until its parent completes
  successfully
- deleting a pending leaf invalidates queued descendants that depend on it
- invalidated descendants disappear from the live leaf set and never become
  durable under those ids

Why this is separate:

- it adds dependency scheduling and invalidation semantics beyond the base
  single-leaf flow

Things to watch:

- this is the most complex part of the spec and should land after the simpler
  single-pending-leaf path is stable
- descendant invalidation needs a clear tree walk over active pending leaves

## Step 9: Follow Behavior And `afterMessageId`

Add the efficiency and UX pieces needed for clean branch following.

Likely additions:

- support `afterMessageId` for graph message reads/streams
- keep any leaf-level `messages(...)` as convenience sugar over the graph call
- let clients follow direct child leaves without replaying the full branch
- codify focused-leaf fallback when a focused leaf is removed

Why here:

- these behaviors depend on the leaf stream and mixed message view already
  existing

## Open Questions And Challenges To The Spec

The server spec is mostly coherent, but a few points deserve explicit scrutiny
before the implementation hardens around them.

### 1. Should queued child pending leaves appear before they have any in-memory messages?

The spec says:

- pending descendants are allowed
- they appear in the live leaf set
- they do not begin execution until the parent completes successfully

That is workable, but it means a pending leaf can exist whose `/messages` view
contains only inherited durable prefix and no leaf-owned suffix yet. That is
not wrong, but it is worth treating as an intentional state rather than an
accident.

This is another reason to treat graph-level message resolution as the primary
abstraction and any per-leaf `messages(...)` API as convenience sugar.

### 2. Is "no explicit loaded boundary" still acceptable for all clients?

The spec intentionally omits snapshot/sync-complete events. That is fine for an
incremental UI, but if the UI later needs a hard "initial replay complete"
signal, retrofitting it will be a protocol change. This is probably acceptable
for now, but it should remain a conscious tradeoff.

### 3. Is `TurnManager` still the right name?

The spec calls the in-process controller tentatively `TurnManager`, but the
public model is leaf-first. Keeping the old name is acceptable if the code
comments are disciplined, but `LeafManager` or `LeafServer` may better match
the architecture.

## Recommended Execution Order

1. finish and verify pending final-message id support
2. make `Turn` a server-owned internal execution object
3. introduce the in-process leaf manager
4. add the merged live leaf-set query
5. add graph-level mixed message resolution
6. refactor `Agent` to consume leaf ids instead of owning execution
7. add the stream-first HTTP API
8. implement pending-leaf dependency and invalidation semantics
9. add `afterMessageId` and focus-follow behavior
10. stop and re-evaluate naming and protocol gaps before polishing further
