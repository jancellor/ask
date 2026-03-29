# Minimal Refactor Plan

Goal: move orchestration and persistence ownership out of `Turn` and into the graph-level service, so the graph service becomes the shared authority for pending state, durable commits, and live leaf updates.

## 1. Make `Turn` execution-only

- Change `Turn.create(...)` so it no longer receives a `MessageGraph`.
- Pass `baseMessages: AskMessage[]` into `Turn` instead of `parentId`.
- Keep `turnId`, config, prompt, cancellation, and transient `onMessages` callbacks in `Turn`.
- Remove all calls from `Turn` to `messageGraph.append(...)`.
- Have `Turn` produce transient messages and a final result, but not persist anything itself.

## 2. Let the graph-level service prepare turn inputs

- Keep the external `createTurn(config, parentId, prompt, onMessages?)` shape for now.
- Inside that method, read `baseMessages` from `messageGraph.branch(parentId)`.
- Construct the `Turn` with those base messages.
- Record pending turn metadata in one place:
  - `turnId`
  - `parentId`
  - current transient messages or current transient tip
  - the `Turn` instance / completion promise

## 3. Move commit responsibility to the graph-level service

- When a turn completes, the graph-level service should append the final durable messages into `MessageGraph`.
- Prefer a single commit at completion time, not incremental writes while the turn is still running.
- Make the commit order explicit:
  - commit to `MessageGraph` first
  - remove the pending turn second
- Keep `turnId === finalMessageId` as the durable handoff identity.

## 4. Let pending state stay ephemeral

- `PendingTurns` should represent only in-flight turns.
- It should not be responsible for durable storage.
- Its `leafEvents()` should continue to expose temporary leaf presence by `turnId`.
- Once the graph-level service owns pending state directly, consider inlining `PendingTurns` into that service if the class no longer adds useful structure.

## 5. Make the graph-level service the owner of merged leaf state

- Do not forward `MessageGraph.leafEvents()` and `PendingTurns.leafEvents()` directly.
- Subscribe to both and maintain graph-level merged state.
- Model visible leaves as:
  - durable message leaves from `MessageGraph`
  - overlaid pending leaves from in-flight turns
  - suppression of a durable parent leaf when a pending child turn exists
- Deduplicate the pending-to-committed handoff by leaf id, relying on `turnId === finalMessageId`.

## 6. Expose explicit graph-level events

- Add graph-level APIs for:
  - current visible leaves
  - visible leaf events
  - branch reads that can include pending state when appropriate
- Keep `MessageGraph` focused on durable persisted structure and durable leaf events only.
- Keep `Turn` focused on executing one turn only.

## 7. Thin down `Agent`

- After the graph-level service owns orchestration, make `Agent` a lightweight wrapper over it.
- `Agent` should mostly:
  - hold local UI/session policy
  - decide what head/tip it is following
  - submit prompts to the shared graph-level service
- Do not decide `Agent` follow policy during the refactor; keep that as a later policy pass.

## 8. Rename only after the split is real

- Keep the current name during the mechanical refactor to avoid mixing architectural and naming changes.
- Once the responsibilities are stable, rename `Graph` to something closer to its real role, such as a graph service / session manager / conversation service.

## 9. Recommended implementation order

1. Change `Turn` to accept base messages and stop writing to `MessageGraph`.
2. Update the graph-level service to create turns from `parentId` by loading the base branch first.
3. Move final commit logic into the graph-level service.
4. Keep `PendingTurns` working with the new turn lifecycle.
5. Add graph-level merged leaf state and graph-level `leafEvents()`.
6. Simplify `Agent` once the graph-level service is authoritative.
