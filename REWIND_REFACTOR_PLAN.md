# Rewind Refactor Plan

## Goals

Refactor the rewind feature so that:

- `Session` owns canonical session graph data in parent-pointer form.
- The rewind API exposed to the UI returns a structural tree, not pre-flattened rows.
- Rewind tree construction is done by iterating messages in reverse chronological order.
- No filtering or ASCII-render-specific shaping happens inside `Session`.
- Child ordering ensures that, at each branch point, the subtree containing the current head is ordered last.

This should preserve the current append-only on-disk session format and keep future enhancements possible, including:

- only reading the last `N` messages later
- keeping a per-node selection rank later to bias sibling ordering
- changing the rewind UI without reworking session logic again

## Current Problems

The current implementation in `src/agent/session.ts` mixes several concerns:

- deriving child links from the parent-pointer graph
- filtering to only certain messages
- flattening directly into a UI row model
- embedding information for ASCII rendering (`level`, `parentLevel`, variation markers)

This makes the rewind logic difficult to reason about, especially when branch points are hidden by filtering.

## Session State After Refactor

Keep `Session` state minimal and canonical:

- `messagesById: Map<string, AskMessage>`
- `headId: string | null`
- `sessionStore: SessionStore`

Rely on `messagesById` insertion order as the chronological ordering source:

- `Session.create()` loads messages oldest to newest and inserts them in that order
- `append()` inserts newly appended messages at the end

This means `messagesById.values()` and `messagesById.keys()` preserve append order naturally, so a separate `messageOrder` array is not needed.

## Rewind Tree API

Replace the current flattened rewind view API with a structural tree API.

Suggested type:

```ts
type RewindNode = {
  id: string;
  message: AskMessage;
  children: RewindNode[];
};
```

Suggested `Session` method:

```ts
getRewindTree(): RewindNode[]
```

The returned array represents the root nodes of the rewind tree:

- initially, this means messages whose `parentId === null`
- later, if only a suffix is loaded, this can naturally become a forest of truncated roots

No synthetic root node should be exposed to the UI.

## Tree Construction Strategy

Build the rewind tree fresh on demand.

For now:

- consume all in-memory messages
- iterate in reverse chronological order by reversing the insertion order of `messagesById`

Later:

- the same builder can consume only the last `N` messages without changing the UI-facing shape

### Reverse Build Model

Because messages are processed newest to oldest:

- all in-scope descendants of a node are known before the node itself is processed
- this naturally supports bottom-up subtree assembly

The builder should internally maintain:

- a map of partially or fully built nodes by id
- a bucket of pending child subtrees keyed by parent id

High-level flow for each message encountered in reverse order:

1. Create the `RewindNode` for the message.
2. Take any already-built child subtrees waiting on this message id.
3. Order those child subtrees immediately.
4. Attach them as this node's `children`.
5. Compute this node's subtree summary fields.
6. Register this completed subtree under its own `parentId` so it can be attached when that parent is encountered.

At the end of the pass:

- the bucket for `null` yields the root nodes returned to the UI
- if suffix-only loading is added later, unresolved non-null parent buckets naturally correspond to truncated roots

## Ordering During Construction

Child ordering should be handled during tree construction, not as a separate pass.

This is a good fit for reverse construction because each child subtree is already complete when its parent is processed.

For the first version, each subtree only needs enough summary information to support:

- whether the subtree contains the current `headId`
- stable fallback ordering by the most recent message in that subtree

That summary does not need to be part of the public `RewindNode`; it can remain builder-local metadata attached to pending child buckets.

The sibling ordering rule should be:

1. Child subtrees not containing the current head come first.
2. The child subtree containing the current head comes last.
3. Relative order among siblings otherwise is by each subtree's most recent message, with more recently touched branches later.

This keeps the logic local and simple.

Because reverse iteration encounters newer messages first, this can still be maintained incrementally by carrying builder-local subtree metadata and inserting each completed subtree into its parent bucket at the correct position.

### Future Compatibility

If later we add a `selectionRankByNodeId`-style feature, the same build-time ordering model can be extended by adding subtree summary such as:

- `maxSelectionRankInSubtree`

The ordering rule can then become:

1. current-head subtree last
2. otherwise higher subtree rank later
3. otherwise more recently touched subtree later

This should not require changing the public `RewindNode` shape.

## Session Refactor Steps

1. Add `messageOrder` to `Session` and initialize it during `Session.create()`.
1. Keep `messagesById` as the sole in-memory chronological source and rely on its insertion order.
1. Remove the current rewind-specific row types and row-building logic from `Session`.
1. Remove filtering logic from `Session` that was only used by rewind.
1. Introduce the new `RewindNode` type and `getRewindTree()` method.
1. Implement the reverse chronological tree builder by iterating `messagesById` in reverse insertion order.
1. Keep `Session.messages` behavior unchanged so normal conversation rendering is unaffected.
1. Update `Agent` to expose `getRewindTree()` instead of `getRewindView()`.

## UI Changes (Rough Direction)

The UI should treat the rewind data as a real tree/forest and derive its display from that structure.

Roughly:

- `Rewind` should request `RewindNode[]` from the agent.
- The UI should decide which nodes are selectable and how selection maps to `nextHeadId` and optional prefill text.
- The UI should flatten the tree into display rows in the traversal order implied by the ordered `children`.
- The UI should compute ASCII prefixes from the actual ancestor/sibling context during flattening rather than consuming precomputed `level` and `parentLevel` from `Session`.

This means the UI becomes responsible for:

- flattening the tree for cursor navigation
- deciding what rows are shown or visually collapsed
- drawing box characters based on the real structural position of each row

This is intentionally less prescriptive than the session-side plan. The exact row model and ASCII rendering strategy should be decided during implementation, once we see the tree data in practice.

## Selection Semantics

The current UI behavior should be reviewed while refactoring, but it does not need to be fully redesigned in the same step.

At present, rewind selection is coupled to a row model where selecting a visible user message effectively sets the next head to that message's parent and may prefill the user's text.

With a structural tree, that behavior should become an explicit UI decision rather than being encoded into the session-side tree shape.

The session-side refactor should not assume a permanent answer here.

## Deferred / Still Flexible

The following points are intentionally left flexible for implementation:

- the exact flattened row type used inside the UI
- how hidden or non-user messages are visually handled in rewind
- whether the UI initially shows every message node or collapses some chains
- whether a node row selects that node directly or uses "rewind and prefill" behavior
- whether future suffix-only loading returns multiple root nodes directly or wraps them in a UI-only synthetic root

None of these should block the session refactor.

## Recommended Sequencing

1. Refactor `Session` and `Agent` first to expose `getRewindTree()`.
2. Update the UI to consume the structural tree and flatten it locally.
3. Validate that the new traversal order matches the desired branch ordering.
4. Only after that, revisit filtering/collapsing and finer-grained rewind UX details.
