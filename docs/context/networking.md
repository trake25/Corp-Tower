# Networking

Scope: WebSocket authority, lifecycle, message families, and cross-boundary fields
whose meaning cannot be recovered from only one endpoint. Gameplay →
[gameplay.md](./gameplay.md). Server producers → [backend.md](./backend.md).

## Connection and identity

Build injects one endpoint; Godot uses `WebSocketPeer` and the server uses `ws`.
Network Manager renders server messages only. On open it sends stored reconnect
and identity credentials. A valid pair resumes its seat; otherwise the server
creates a session and uses the requested public, private-create, or private-join
entry mode. A private entry is locally single-flight and retains its fields until
server room entry, rejection, definitive connect failure, or transport closure.
Persisted-room resume takes precedence over fresh entry fields, and the public
default ignores private fields. Verified identity overrides the claimed profile;
required auth closes an unverified socket.

If the persisted room cannot be restored, the server clears its session room
reference before reporting `resume_unavailable`. Private-lobby expiry also
persists the server-selected shell destination across retries; the client clears
that room identity only after receiving the authoritative route.

Focus return blocks play and requests fresh state. Missing authoritative updates
start recovery only while the match is expected to stream in `starting` or
`playing`; `finished`, `failed`, and `game_over` may stay quiet for presentation.
A stale transport reconnects to the same configured endpoint. One total recovery
deadline spans resync and reconnect, then ignores late state and returns the
player Home. Manual disconnect and app close do not recover. RTT is only a
quality indicator.

Only a session's current opaque connection id may act or disconnect, so an old
socket cannot invalidate a resumed connection.

## Lobby and room lifecycle

Seats fill incrementally and `room_created` or `room_resumed` arrives as soon as a
seat is assigned. A full room starts a ready window; every seat must be ready
before `match_started`. Bots are pre-readied. Leaving or disconnecting during
ready-up removes that seat immediately, resets survivor readiness, and cancels
the timer until the room fills again. Only a room with no real players closes.

Lobby updates carry roster, ready membership, and an integer countdown derived
from the server deadline. Lobby state and its deadline persist so the lease owner
can re-arm the timer after hydration.

Cross-pod public seating returns a room it cannot own rather than mutating a
replica. Private invite lookup instead targets its live owner and never falls
through to public seating; its payload carries invite, host, start, and reserved
seat phases. Only a full connected roster may ready; transport loss unreaddies
and reserves its seat without active-match UI. Owner lobby/start broadcasts
reach remote replicas.

Terminal `room_closed` carries a reason and optional global or per-player destination. The owner
publishes it before deletion; other pods forward it once and discard their
replicas. Lobby timeout closes only not-ready seats while ready players and bots
can remain in the persisted room.

## Message families

Server messages fall into five contracts:

- Session assignment: room identity, inventory, roster, lobby/start state, and
  terminal `resume_unavailable` when Play cannot be restored.
- Lobby lifecycle: roster/readiness changes and match start.
- `game_state`: the complete authoritative room presentation used for rendering
  and recovery.
- `debug_config`: the validated live tuning snapshot.
- `room_closed`: teardown reason and navigation destination.

Client actions are reconnect, ready/leave-lobby, private host kick, place block,
activate Power, quick chat, debug update, and `resync_state`. Resync carries only correlation and
the last revision. Every stateful action is validated for room, identity,
connection, state, cooldown, and domain rules; Power is room-wide and chat sends
a template slot, never free text.

Latency diagnostics use a client nonce: `latency_ping` receives a same-socket
`latency_pong` carrying that nonce. The server neither persists nor fans it out;
RTT is device-local transport telemetry, not room state.

## Placement contract

`place_block` identifies an inventory slot plus an intended column and optional
release row. The server clamps the column to the legal origin range for the
brick's footprint and current level site.

An exact client snap sends the aimed row. If that row is still legal when the
server processes it, gravity begins there; otherwise the server releases above
the tower. Unsnapped and bot placements omit it. Ignoring this field silently
removes gap placement, so client preview, wire payload, and both settle mirrors
must move together.

`Number(null)` is `0`; the server must distinguish absence before numeric
coercion. Client-only target-point and matched-vertex data never crosses the wire.

## Authoritative game state

`Game_Engine.js` builds enough state to redraw or resume without local gameplay
reconstruction:

- level state and its current deadline;
- authoritative grid width and derived placeable range;
- inventory, shared-pile count, and visible next draw;
- ordered tower blocks with coordinates, lifecycle/component identity,
  placement Balance, and per-brick support stability;
- worst-component compatibility diagnostics plus component summaries with
  authoritative height and component-scoped presentation poses;
- roster, scores, accessibility defaults, and synchronized visual hooks;
- transient score, quick-chat, and Power events;
- side quest, summaries, and canonical Impact contribution/retry status.

The client derives render center and snapping from the transmitted grid;
structural pose never affects aiming or legality. `impactScoreStatus` includes
live contribution exactly once, so clients must not add level score.

Support values and their thresholds are authoritative presentation. Standing
values recalculate; fallen values freeze in persisted entries so reconnect keeps
the face without client-side stability reconstruction.

Transient events are id-deduplicated, consumed after broadcast, and never
persisted or replayed. Snapshots persist tower, inventory, scores, checkpoints,
retries, Power, lifecycle, and deadlines. Placement breakdowns stay server-owned.

`game_state.stateRevision` orders durable state across recovery. A reconnect or
`resync_state` receives a targeted snapshot with empty transient-event arrays.
Either the correlated snapshot or a newer accepted complete `game_state` proves
authoritative progress before interaction is re-enabled. A missing room produces
`resume_unavailable` rather than leaving Play attached to stale state.

## Wire adapters

Server Entry parses sockets and forwards actions; Lobby Manager resolves the
lease owner or republishes; Game Engine produces state without socket or Redis
knowledge. Network Manager owns polling, the configured endpoint, reconnect
credentials, and shell signals, never game outcomes. Unknown optional fields
degrade quietly.

## Compatibility boundary

Client, server, and persisted room shape are deployed together. There is no
general rolling mixed-version guarantee for in-flight rooms. When a field moves,
update producer, persistence, consumer, routing docs, and focused verification as
one full-stack change.
