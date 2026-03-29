# Graph Spec

This note describes the target public model for the graph layer.

It is intentionally about the shape we are moving toward, not the current file
layout or intermediate implementation details.

## Core Idea

The primary public resource is a `Leaf`.

A `Leaf` is identified by a `leafId`. That id uniquely identifies a path from
root to tip in the current graph view.

There are two cases:

- A complete leaf is a durable message graph leaf.
- A pending leaf is an in-progress turn whose final durable message will use
  that exact same `leafId`.

This means a leaf id is stable across the pending-to-complete handoff.

## Public Graph Surface

The graph layer should converge on a small leaf-centric API:

- `graph.leafEvents()`
- `graph.getLeaf(id, fromId?)`
- `graph.ask(parentId, prompt, config, fromId?)`
- `graph.cancel(id)`

These names may still be adjusted, but the concepts should remain the same.

## `Leaf`

Both `graph.getLeaf(...)` and `graph.ask(...)` should return the same kind of
object: `Leaf`.

A `Leaf` should contain:

- static metadata about the leaf
- one message stream

The object should be as similar as possible to the future HTTP representation.

Suggested shape:

```ts
type Leaf = {
  id: string;
  parentId: string | null;
  model?: string;
  provider?: string;
  variant?: string | null;
  messages: AsyncIterable<AskMessage>;
};
```

Notes:

- `done` is not a required field. End-of-stream can represent completion.
- `cancel` should not be a method on the returned object. Cancellation should be
  done through `graph.cancel(id)`.
- Additional metadata can be added later, but the object should stay centered on
  static info plus one stream.

## `graph.ask(...)`

`graph.ask(parentId, prompt, config, fromId?)` creates a new pending leaf and
starts executing it.

It should return a `Leaf` object immediately.

Semantics:

- the returned `Leaf.id` is the preallocated final message id for the turn
- the returned `Leaf.messages` stream yields the messages associated with that
  leaf
- `fromId` controls how much already-known committed history is included in the
  stream

The caller therefore gets both:

- the new leaf id
- an immediate stream for that leaf

This avoids forcing the caller to create a leaf with one request and then open
the stream with a second separate step.

## `graph.getLeaf(...)`

`graph.getLeaf(id, fromId?)` returns the same `Leaf` object shape as `ask()`,
but for an already-known leaf.

This is the uniform observation entry point for:

- leaves created by this caller
- leaves created by other callers
- complete leaves
- pending leaves

The caller should not need to know whether a leaf is backed by durable history
only or by durable history plus an in-progress turn.

## `graph.leafEvents()`

`graph.leafEvents()` is the discovery/index stream.

It tells watchers which leaves currently exist and when leaves are added or
removed.

It is distinct from the per-leaf message stream:

- `leafEvents()` tells you that a leaf exists
- `getLeaf()` / `ask()` gives you the actual leaf object and its message stream

This means there are two valid ways to learn a leaf id:

- directly from `ask(...)` when you created it
- from `leafEvents()` when observing globally

That is intentional and not considered duplication. One is request/response,
the other is discovery/pub-sub.

## `fromId`

`fromId` is a branch-history filter.

Semantics:

- `fromId = null` means include all messages for the leaf
- `fromId = undefined` means include no existing messages and only stream new
  messages

The distinction matters because callers may later want to list many leaves
without automatically replaying the full history for each one.

This should apply consistently to both:

- `graph.ask(..., fromId?)`
- `graph.getLeaf(..., fromId?)`

## Durable History vs Pending Turn Output

The stream for a leaf may be composed from two sources:

- committed durable messages from the message graph
- transient messages from a currently running turn

The split should be handled at the graph layer.

Important rule:

- `fromId` applies only to the committed history portion
- it should not slice into the middle of the currently executing turn

This relies on the intended precondition:

- callers use `fromId` only for messages they already know from prior committed
  history
- they do not use it to request "resume from the middle of the current turn"

## Turn Objects

Turn objects may still exist internally, but they are not intended to be the
primary public abstraction.

Preferred model:

- `Turn` is internal execution machinery
- `Graph` is the public API
- external consumers interact with leaves through the graph

This keeps observation uniform:

- a leaf created by this caller
- a leaf created by another caller
- a pending leaf
- a complete leaf

all use the same public interface.

## Snapshots vs Streams

The target public API is stream-first.

Snapshot helpers may still exist internally or as convenience helpers, but the
main public model should be:

- leaf discovery via `leafEvents()`
- leaf observation via `Leaf.messages`

This is the model that should be preserved across the future client/server
boundary.

## HTTP Boundary Alignment

The in-process API should stay as close as possible to the future remote API.

Likely HTTP mapping:

- `POST /leaves` -> `graph.ask(...)`
- `GET /leaves/:id` -> `graph.getLeaf(...)`
- `DELETE /leaves/:id` -> `graph.cancel(id)`
- `GET /leaves` -> `graph.leafEvents()`

The key point is that `POST /leaves` and `GET /leaves/:id` should represent the
same resource shape.

## Summary

The model we are aiming for is:

- `Leaf` is the public resource
- `leafId` is stable across pending and complete states
- `Graph` is the public API
- `Turn` is internal
- `leafEvents()` is for discovery
- `getLeaf()` and `ask()` return the same kind of object
- a `Leaf` is static metadata plus one message stream
- `fromId` controls how much committed history to replay, with:
  - `null` meaning all messages
  - `undefined` meaning no replay
