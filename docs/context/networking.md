# Networking

Scope: WebSocket authority, lifecycle, message families, and cross-boundary fields
whose meaning cannot be recovered from only one endpoint. Gameplay →
[gameplay.md](./gameplay.md). Server producers → [backend.md](./backend.md).

## Connection and identity

The client endpoint is injected at build time. Godot uses `WebSocketPeer`; the
server uses `ws`. Network Manager never predicts a game outcome: it updates view
state only from server messages.

On open, the client sends its stored player id and reconnect token plus available
identity credentials. A valid reconnect pair resumes the same room and seat;
otherwise the server creates a session and joins or creates a room. Verified
Supabase or native Facebook identity overrides a claimed profile id. When auth is
optional, absent or expired identity falls back to the client profile; required
auth closes the socket.

Automatic reconnect applies only to unintended disconnects from a started,
all-real-player room and has a finite attempt count. Manual disconnect and app
close do not trigger it.

## Lobby and room lifecycle

Seats fill incrementally and `room_created` or `room_resumed` arrives as soon as a
seat is assigned. A full room starts a ready window; every seat must be ready
before `match_started`. Bots are pre-readied. Leaving or disconnecting during
ready-up removes that seat immediately, resets survivor readiness, and cancels
the timer until the room fills again. Only a room with no real players closes.

Lobby updates carry roster, ready membership, and an integer countdown derived
from the server deadline. Lobby state and its deadline persist so the lease owner
can re-arm the timer after hydration.

Cross-pod matchmaking never lets two workers mutate one in-memory room. A pod
that cannot own a claimed open room returns it and creates or joins another local
room. This guarantees a seat, not that simultaneous players on different pods
share the same room.

Terminal `room_closed` carries a reason and optional destination. The owner
publishes it before deletion; other pods forward it once and discard their
replicas. Lobby timeout closes only not-ready seats while ready players and bots
can remain in the persisted room.

## Message families

Server messages fall into five contracts:

- Session assignment: room id, player/reconnect identity, initial inventory,
  roster, lobby state, and whether play has started.
- Lobby lifecycle: roster/readiness changes and match start.
- `game_state`: the complete authoritative room presentation used for rendering
  and recovery.
- `debug_config`: the validated live tuning snapshot.
- `room_closed`: teardown reason and navigation destination.

Client actions are reconnect, ready/leave-lobby, place block, activate Power,
send quick chat, and update debug configuration. Every action is validated
against room ownership, state, player identity, cooldowns, and its domain rules.
Power has no target and applies room-wide. Quick chat sends a template slot, not
arbitrary text.

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

The state payload supplies enough information to redraw or resume without local
gameplay reconstruction:

- level state and its current deadline;
- authoritative grid width and derived placeable range;
- inventory, shared-pile count, and visible next draw;
- ordered tower blocks with resolved coordinates, standing/fallen state,
  component identity, and placement-time Balance result;
- worst-component compatibility diagnostics plus component summaries and
  component-scoped presentation poses;
- roster, scores, accessibility defaults, and synchronized visual hooks;
- transient score, quick-chat, and Power events;
- side quest, summaries, and canonical Impact contribution/retry status.

The client derives render center and snapping range from the transmitted grid.
Structural pose never affects aiming or legality. `impactScoreStatus` already
includes live contribution exactly once; clients must not add level score to it.
Compatibility aliases may be read for mixed-version fallback but new logic uses
the contribution-named fields.

Transient events carry ids for client de-duplication and are consumed after
broadcast. They are not persisted or replayed after reconnect. Room snapshots
persist durable state: tower, pose, inventory, score/contribution, checkpoint,
retry, Power, lobby lifecycle, and relevant deadlines.

## Wire adapters

Server Entry accepts sockets, performs connection-level parsing/error handling,
and forwards actions to Lobby Manager. Lobby Manager resolves room ownership and
either executes on the lease owner or republishes to it. Game Engine produces
authoritative state but does not know about sockets or Redis.

Network Manager owns socket polling, reconnect credentials, endpoint failover,
message dispatch, and signals consumed by the client shell. It does not score,
settle, validate, or advance a room. Unknown optional fields degrade quietly;
unknown message types are logged rather than interpreted as game state.

## Compatibility boundary

Client, server, and persisted room shape are deployed together. There is no
general rolling mixed-version guarantee for in-flight rooms. When a field moves,
update producer, persistence, consumer, routing docs, and focused verification as
one full-stack change.
