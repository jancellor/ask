# Core Concepts

This note sketches a layered model for Ask's conversation state.

The aim is to keep the immutable core simple, while leaving room for more
ergonomic UI and server behavior.

## Layer 1: Messages

The most fundamental concept is the message graph.

- Every message has an immutable `messageId`.
- Every non-root message has a `parentId` pointing at another message.
- Together, messages form a DAG that is usually a forest of trees.
- Messages are durable and never change once written.

This is analogous to Git commits:

- `commit` ~= `message`
- `commit hash` ~= `messageId`

From just this layer, Ask already gets:

- full durable history
- rewind/fork behavior
- the ability to reconstruct linear chains by following parent links
- the ability to compute roots and current graph leaves

## Roots And Leaves

Two useful derived graph concepts are `root` and `leaf`.

- A `root` is a message with no parent.
- A `leaf` is a message with no known children in the current graph.

Roots and leaves are graph-derived concepts. They are not separate durable
objects at this layer.

Since the full message graph is usually a forest:

- each disconnected tree is identified by its root `messageId`
- each root therefore identifies a whole tree
- each tree may have one or more leaves
- each leaf identifies a complete linear branch
- that branch can also be understood as lying within the tree identified by its
  root

A system should be able to support queries such as:

- list all root `messageId`s
- list all leaf `messageId`s
- list all leaves within a given root/tree

Roots are likely the best default top-level listing primitive, because they
identify whole disconnected trees and are closer to how users tend to think
about reopening a conversation. Leaves could also be listed, especially in more
branch-oriented workflows.

`root` and `leaf` are graph-centric names. They are useful internally even if
more user-facing terminology is chosen later.

## Asking By Message ID

In the most minimal model, the only stable identifier is `messageId`.

That means Ask operations can target a leaf message directly:

- "ask from this leaf"
- "cancel this leaf"
- "subscribe to this leaf"

In this mode, a client is effectively operating in a detached-head style:

- it remembers a current leaf `messageId`
- each new turn advances that leaf to a new `messageId`
- the client must track the moving leaf itself

This is analogous to Git detached `HEAD`: the immutable object id is enough to
operate, but it is not a stable moving name.

## In-Progress Turns

The main complication compared with Git is that Ask turns can be in progress.

To support that, a new leaf `messageId` can be allocated immediately when an
`ask` request is accepted.

At a high level:

1. Client sends "ask from leaf/root X".
2. Server allocates the next leaf `messageId` immediately.
3. Server returns that new leaf `messageId` right away.
4. The turn then runs asynchronously.
5. The final assistant message for the turn is written using that preallocated
   `messageId`.

This allows a client to:

- attach to an in-progress continuation immediately
- queue follow-up work against the pending leaf
- cancel by referring to the pending leaf

This is coherent, but it means the system is using immutable `messageId`s as
handles for a moving conversational continuation.

That can work, but it pushes more tracking responsibility onto clients.

## Layer 2: Heads

An optional convenience layer is to introduce a stable mutable reference to one
linear continuation. We call this a `head`.

- A head has a stable `headId`.
- A head points at a current `leafMessageId | null`.
- As new messages are appended to that linear continuation, the head's leaf
  moves forward.
- Rewinding a head means mutating it to point at some earlier `messageId`.

This is analogous to a Git branch ref:

- `branch` ~= `head`
- branch head commit ~= head leaf message

The value of a head is not that it creates branching. The message graph
already does that. Its value is giving a stable identity to a moving leaf.

## Detached Mode And Heads

Heads are best thought of as a convenience layer, not the deepest truth.

- The immutable truth is still the message graph.
- A UI or agent can operate directly on `messageId`s, like detached `HEAD`.
- A head is an optional stable moving handle for when that is more ergonomic.

This lets the system support both styles:

- detached mode: client tracks the current leaf itself
- attached mode: client talks to a stable `headId`

For a human UI, head mode is usually nicer because the user wants to keep
adding to the same ongoing linear conversation.

For ephemeral fan-out subagents, detached mode may be sufficient at first.
