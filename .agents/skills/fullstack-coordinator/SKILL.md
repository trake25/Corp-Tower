---
name: fullstack-coordinator
description: Changes that span the server and the Godot client at once — a new broadcast field, a new client-to-server action, a rule whose preview lives on the client, or any edit where the wire payload moves. Also the escape hatch when it is not obvious which role owns a task.
---

# Fullstack coordinator

**This is not a third rulebook.** `client-engineer` and `server-engineer` hold
the policy. This skill pins the contract between them and loads both policies in
sequence.

**Route:** [`networking.md`](../../../docs/context/networking.md) § only. Do not
load `backend.md` or `ui.md` here — each role policy routes its own implementation.

## Procedure

1. **Pin the wire contract first.** Name the exact field or action, its type, its
   direction, and which broadcast carries it. Write that down before either side
   is edited; it is the thing both edits are checked against.
2. **Server first, then client.** The client renders what it is sent, so the
   payload has to exist before the renderer for it can be tested.
3. **Load role policies in sequence** — `server-engineer`, then
   `client-engineer` — and carry the pinned contract into each implementation.
4. **Both settle mirrors move together.** A placement-semantics change touches
   the server function, its `SnapGrid` mirror, and the ghost preview. One without
   the others is a silent divergence, not a partial change.

## Ambiguous routing

If the owning role is unclear, decide by **where the outcome is computed**, not
by which file is bigger. The outcome is always the server's; the client's share
is the preview. A task that only previews differently is `client-engineer`.

## Always

- **Done =** `qa-engineer` gate over **both** suites, then `docs-steward`.
