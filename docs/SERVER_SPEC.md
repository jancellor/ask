# Server Spec

This note describes the current intended server model for Ask.

The goal is to expose the message graph, including in-progress turns, through a
single server that multiple UI clients can watch and control in real time.

## Core Model

The public server concept is a `leaf`.

- A complete leaf is a durable message graph leaf.
- A pending leaf is an in-progress turn whose final assistant message has not
  yet been written to the graph.
- A pending leaf is identified by the exact `messageId` that will be used for
  the final assistant message if the turn completes successfully.

This gives one identity model:

- while pending, the leaf exists in server memory only
- when complete, the same id exists durably in `MessageGraph`
- at any moment, a continuation point is identified by exactly one id

Internally, the server will still have turn-like objects to manage execution,
but the external API should be graph-centric and leaf-centric.

There are two related but distinct concerns:

- leaf tracking and control
- message retrieval along graph paths

The current direction is to treat message retrieval as a graph-level primitive,
while still allowing leaf-oriented convenience APIs on top of it.

## In-Memory Server Model

The in-process server-side controller is tentatively `TurnManager`.

Responsibilities:

- allocate pending leaf ids
- create and own active in-memory turns
- index active turns by `pendingMessageId`
- merge active in-memory leaves with durable graph leaves for clients
- cancel active turns

Lifecycle:

- a new ask creates a new pending leaf
- the active turn is stored in `Map<pendingMessageId, Turn>`
- when `ask()` settles, the turn is removed from the map
- if the ask completed successfully, that same id is now part of the durable
  message graph
- if the ask was canceled or failed before becoming durable under that id, the
  pending leaf disappears from the live leaf set

Constraints:

- there is no separate "empty turn" lifecycle in the public API; creating a
  pending leaf and starting the ask are one combined operation
- the server should not maintain a second durable store of completed turns
- the durable truth remains the message graph on disk

## Client / Server Symmetry

The design should support both in-process and remote use.

- `ServerTurn` is the real in-memory execution object
- `ClientTurn` can later mirror the same API and proxy over HTTP
- both are identified by the same pending leaf id

This keeps the client unaware of whether it is talking to local objects or a
remote process.

## HTTP API

The public HTTP API should be leaf-first rather than turn-first.

The current minimal surface is:

### `POST /leaves`

Create and start a new pending leaf from an existing message graph node.

Request body:

```json
{
  "parentId": "message-or-leaf-id",
  "prompt": "do this"
}
```

Response body:

```json
{
  "leafId": "pending-message-id"
}
```

Notes:

- `parentId` does not need to be a current leaf; branching from internal nodes
  is allowed
- creation and first `ask` are intentionally combined into one operation
- this avoids an awkward intermediate state where a pending leaf exists with no
  messages yet

### `DELETE /leaves/:leafId`

Cancel an active pending leaf.

Notes:

- deletion is valid at any time
- if the leaf has already completed, deletion is a no-op
- this prevents that pending leaf id from becoming part of the durable leaf set
- deleting a pending leaf also invalidates any pending descendants that depend
  on it completing
- if cancellation later becomes durable in some other form, the pending leaf is
  still removed and any replacement durable leaf would be a different id

### `GET /leaves`

Stream changes to the global leaf set.

This is a streaming endpoint. The path does not need to advertise that fact.

Event model:

- the stream emits `added` events for all currently known leaves
- then continues emitting `added` and `removed` events as the global leaf set
  changes

Suggested event shapes:

```json
{ "type": "added", "leafId": "id", "parentId": "parent-or-null" }
```

```json
{ "type": "removed", "leafId": "id" }
```

Notes:

- no separate snapshot event is required if clients are happy to render leaves
  incrementally as they arrive
- no `pending` / `complete` flag is required in the payload if we keep the leaf
  set itself as the source of truth
- an extension of one leaf into another is naturally represented as
  `removed(oldLeafId)` plus `added(newLeafId, parentId=oldLeafId)`

### `GET /leaves/:leafId/messages`

Stream the branch/messages associated with one leaf.

Event model:

- the stream emits `added` events for the existing branch messages for that leaf
- then continues emitting `added` events for newly appended messages if that
  leaf is still backed by an active in-memory turn

Suggested event shape:

```json
{
  "type": "added",
  "messages": []
}
```

Notes:

- this is the same mechanism whether the watching client created the leaf or
  another client did
- a pending leaf's message stream is the durable branch prefix plus the
  in-memory suffix accumulated so far
- the endpoint may later support `afterMessageId` so clients can resume from a
  known processed boundary instead of replaying the whole branch
- a complete leaf may simply finish replaying existing messages and then remain
  idle or close, depending on transport choices made later

### Possible Generalization: `GET /messages`

The leaf-specific message endpoint is useful, but the underlying operation is
more naturally graph-based than leaf-based.

Likely underlying shape:

```json
{
  "toMessageId": "leaf-or-message-id",
  "afterMessageId": "optional-known-boundary"
}
```

Semantics:

- stream the path ending at `toMessageId`
- if `afterMessageId` is provided, only emit messages strictly after that id
- reject the request if `afterMessageId` is not on the path to `toMessageId`

This is a better conceptual primitive because it also supports:

- following a leaf efficiently
- starting from non-leaf message ids later if needed
- other graph-oriented queries that are not inherently leaf-specific

Current conclusion:

- keep `GET /leaves/:leafId/messages` as a convenient public shape for now
- treat it as sugar over a more general graph-level message retrieval model

## Streaming Model

The current preferred design is stream-first rather than split read + subscribe.

Reasoning:

- clients should not need a separate initial fetch followed by a realtime
  subscription
- using one connection avoids bootstrap race windows
- the UI can render state incrementally as events arrive

Current simplification:

- we do not require an explicit `snapshot` or `sync-complete` event
- streams may simply replay current state via normal `added` events and then
  continue with live changes

What this loses:

- the client cannot know exactly when initial replay is complete
- the UI cannot confidently distinguish "truly empty" from "not finished
  replaying yet" using protocol signals alone

Current conclusion:

- this is acceptable for now because the UI can render incrementally and does
  not need a hard "loaded" boundary

## Following Extensions

The server remains leaf-first, but a client may still present the experience as
one ongoing conversation by following direct child leaves.

Intended behavior:

- when a new leaf is added with `parentId === focusedLeafId`, the client may
  treat that as an extension of the currently focused branch
- when following that extension, the client should switch focus to the new
  `leafId`
- to avoid replaying the entire shared prefix, the client should be able to call
  `messages({ toMessageId: leafId, afterMessageId })` or equivalent leaf sugar
- `afterMessageId` should be the last processed message id currently shown in
  the main view, not merely the last one received on the wire

Important note:

- a leaf message stream is complete once it emits the message whose id equals
  that leaf's own `leafId`

This means the UI only needs a stable processed boundary from the currently
shown branch in order to resume efficiently on a newly followed child leaf.

## Pending Leaf Dependencies

Pending leaves may depend on other pending leaves.

This allows chaining:

- leaf `B` may be created from pending leaf `A`
- leaf `C` may be created from pending leaf `B`
- and so on

Execution semantics:

- each pending leaf still has `parentId` equal to the leaf it extends
- a child pending leaf cannot run until its parent leaf has completed
  successfully
- deleting a pending leaf invalidates any queued descendants that depend on it
- invalidated descendants are removed from the live leaf set and never become
  durable under those ids

This means cancellation is meaningful even for a pending leaf that already has
pending descendants.

## Focused Leaf Removal

If the currently focused leaf is removed from the live leaf set, the client
should fall back through the graph rather than trying to preserve focus on a
non-existent tip.

Suggested behavior:

- when `removed(focusedLeafId)` is observed, switch focus to that leaf's parent
- if that parent is also gone, continue walking upward until an existing
  ancestor is found
- after fallback, normal leaf-added rules continue to apply

This handles cancellation and invalidated descendant chains in a graph-shaped
way without introducing special UI-only server semantics.

## UI Model

The intended UI model is:

- one global leaf list, updated from `GET /leaves`
- one focused branch view, updated from graph message streaming targeted at the
  selected leaf id

Branching behavior:

- if the focused leaf is extended by the local client, the UI should move focus
  to the new pending leaf id
- if the focused leaf is extended by a newly added direct child and the client
  is in follow mode, the UI may also move focus to that child using the normal
  follow rules above
- if another client later starts a sibling branch from the same parent, that new
  branch should appear in the global leaf list
- it should not hijack the currently focused branch view

This makes the main pane follow one chosen branch while the side panel exposes
all possible continuation points.

## TypeScript Shape

In TypeScript, the current minimal model is best described with separate root
objects for leaves and graph messages.

Sketch:

```ts
type MessageId = string;

type LeafInfo = {
  leafId: MessageId;
  parentId: MessageId | null;
};

interface Leaves {
  create(input: {
    parentId: MessageId | null;
    prompt: string;
  }): Promise<LeafInfo>;

  delete(leafId: MessageId): Promise<void>;

  stream(): AsyncIterable<
    { type: 'added'; leaf: LeafInfo } | { type: 'removed'; leafId: MessageId }
  >;
}

interface MessageGraphView {
  messages(input: {
    toMessageId: MessageId;
    afterMessageId?: MessageId;
  }): AsyncIterable<{ type: 'added'; messages: AskMessage[] }>;
}

interface AskServer {
  leaves: Leaves;
  messageGraph: MessageGraphView;
}
```

Leaf-level `messages(...)` can still exist as convenience sugar, but the
intended underlying primitive is graph-level:

- `leaf.messages({ afterMessageId })`
- equivalent to `messageGraph.messages({ toMessageId: leaf.leafId, afterMessageId })`

## Minimal Payload Philosophy

Keep public payloads minimal unless extra metadata proves necessary.

For leaf events, the current preferred fields are:

- `leafId`
- `parentId`

Fields intentionally deferred for now:

- `rootId`
- timestamps
- cwd / config metadata
- explicit `pending` / `complete` state flags

The preference is to avoid introducing multiple sources of truth when the graph
structure and active-turn set can already imply most of this.

## Alternatives Considered

### Separate turn ids and message ids

Rejected for now.

Why it was considered:

- separate ids decouple execution lifetime from durable graph identity

Why the single-id model is preferred:

- the UI wants one identifier for both pending and complete continuation points
- "list all leaves" becomes simpler if pending and complete items share the same
  identity model
- the server can treat turns as pending messages rather than a separate class of
  public object

### Separate create and ask operations

Rejected for now.

Why it was considered:

- it mirrors object creation followed by method invocation

Why the combined operation is preferred:

- it avoids exposing a pending leaf that has no messages yet
- it makes a pending leaf mean "an executing ask" rather than "an empty handle"

### Separate read and realtime endpoints

Rejected for now.

Why it was considered:

- conventional REST plus a separate event stream is familiar

Why the stream-first approach is preferred:

- it avoids bootstrap races
- it gives one mechanism for both initial state and live updates
- it keeps the UI's mental model simple
