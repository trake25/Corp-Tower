# Networking

Scope: WebSocket authority, session lifecycle, payload families, recovery, and fields whose meaning crosses client/server boundaries.

<!-- kb
id: network.session.identity
alias: connection identity
alias: auth wire
source: src/Server/app/Server.js#handleMessage
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#connect_server
adjacent: backend.identity.auth
-->
## Startup identity

The client connects to its build-injected endpoint and sends reconnect/identity credentials when the transport opens. Verified server identity overrides a claimed profile when authentication is configured; required authentication closes an unverified socket.

<!-- kb
id: network.profile.session
alias: profile bootstrap
alias: profile name change wire
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#connect_profile_server
source: src/Server/app/Server.js#handleProfileMessage
adjacent: backend.identity.profile
adjacent: ui.profile.presentation
-->
## Profile session

Profile and first-login naming use an authenticated profile-only WebSocket path on the existing
client/server transport. This path resolves the durable verified account but never enters matchmaking
or room membership. The server supplies authoritative profile state and owns the one-time name
mutation; the client presents that state and derives Profile connectivity from the live profile
connection. The authenticated profile-only connection may carry bounded provider-link eligibility,
ownership-preflight, and canonical-provider commit results because it already resolves the current
durable account without entering matchmaking. Provider credentials are verified server-side and are
never echoed to the client; the wire exposes only the result needed to continue, reject, or refresh
Account presentation.

<!-- kb
id: network.session.resume-only
alias: resumeOnly
alias: saved room resume
source: src/Server/app/Lobby_Manager.js#resumePlayer
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#send_reconnect_request
adjacent: ui.startup.restoration
adjacent: backend.lobby.connection
-->
## Resume-only startup

Authenticated startup with saved room identity enters resume-only recovery. The server either restores that persisted room or returns `resume_unavailable` with the authoritative shell destination; it does not silently turn a failed resume into fresh matchmaking.

<!-- kb
id: network.session.recovery
alias: resync
alias: reconnect recovery
alias: stale stream
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#begin_recovery
adjacent: ui.play.recovery
adjacent: backend.lobby.connection
-->
## Active stream recovery

While a match is expected to stream in starting or playing state, missing authoritative updates trigger recovery. Focus return blocks interaction and asks for fresh state. A stale transport reconnects to the same configured endpoint. One total recovery deadline spans resync and reconnect; timeout ignores late state and follows the configured shell continuation.

<!-- kb
id: network.session.supersession
alias: old socket
alias: current connection id
source: src/Server/app/Lobby_Manager.js#isCurrentPlayerConnection
source: src/Server/app/Redis_State.js#isCurrentSessionConnection
adjacent: backend.lobby.connection
-->
## Socket supersession

Only the session's current opaque connection id may act or disconnect. Closing an old socket cannot invalidate a newer resumed connection.

<!-- kb
id: network.room.public
alias: public lobby wire
alias: ready up
source: src/Server/app/Lobby_Manager.js#toggleLobbyReady
adjacent: backend.lobby.public
-->
## Public lobby

Public seats fill incrementally and assignment arrives as soon as a real seat is owned. The first real player establishes a two-minute production-bot threshold.
When production Public Lobby bot fill is enabled and the threshold has matured, cooperative bots fill only remaining capacity; each such bot becomes ready only after its two-second join delay has elapsed while at least one real player is connected. Bot seats remain replaceable by real matchmaking entrants until match start.
The dedicated debug toggle may disable production fill in waiting public rooms, removing production bots and reopening their seats while preserving the original threshold for later re-enable; it never removes bots from a match already in progress and is independent of the existing debug-bot controls.
A full current roster uses the normal ready window and every participant must be ready before the match starts. A public transport disconnect preserves the real seat through reconnect eligibility, clears that human's ready state, and prevents bot-only start; reconnect restores the seat, while intentional leave or reconnect expiry removes it.
When no real or reconnect-eligible seat remains, the room closes instead of leaving a bot-only public room alive.

<!-- kb
id: network.room.private
alias: private lobby recovery
alias: reserved seat
source: src/Server/app/Lobby_Manager.js#joinPrivateRoom
adjacent: backend.lobby.private
adjacent: ui.private-lobby.presentation
-->
## Private lobby

Private-lobby transport loss unreaddies and reserves the seat through recovery/grace rather than replacing the player. Lobby state, deadlines, invite, host, and reserved-seat phases persist so the live owner can restore the lobby after hydration.

<!-- kb
id: network.room.bot-spectator
alias: bot spectator launch
alias: spectator_start_rejected
source: src/Server/app/Server.js#handleMessage
source: src/Server/app/Lobby_Manager.js#createBotSpectatorRoom
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#start_bot_spectator_match
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#update_config
adjacent: backend.lobby.bot-spectator
adjacent: ui.debug.entry
-->
## Bot spectator launch

Debug-enabled clients request `bot_spectator` before participant seating with three profiles. The server validates the launch and creates an observer outside `room.players`. Placement, Power, chat, ready, kick, and other gameplay mutations cannot change a spectator room. Build-gated calibration alone may send `update_config` through the validated Debug Config path shared by participant Play. Resync and intentional leave remain available; spectator identity is not saved and leaving retires the transient room.

<!-- kb
id: network.room.cross-pod
alias: cross pod routing
source: src/Server/app/Lobby_Manager.js#dispatchRoomAction
source: src/Server/app/Redis_State.js#publishRoomAction
adjacent: backend.lobby.cross-pod
-->
## Cross-pod room routing

A pod that does not own a room relays or republishes to the lease owner instead of mutating a replica. Private invite lookup targets the live owner and never falls through to public seating. Owner broadcasts are forwarded to replicas.

<!-- kb
id: network.room.close
alias: room_closed
source: src/Server/app/Lobby_Manager.js#closeRoom
adjacent: backend.lobby.close
adjacent: ui.navigation.server-routes
-->
## Room close

`room_closed` carries the terminal reason and optional global/per-player destination. The owner publishes it before deletion; replicas forward it once and discard their local copy.

<!-- kb
id: network.room.active-leave
alias: game_left
alias: leave_game
source: src/Server/app/Lobby_Manager.js#leaveGameForRoom
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#leave_game
adjacent: backend.lobby.active-leave
adjacent: hud.players.presence
-->
## Active leave

`leave_game` intentionally exits one active participant. The server clears only the current connection's session-room binding, retains score/history with left presence, and returns targeted `game_left`. The client clears resumable room identity and disconnects only after acknowledgement.

<!-- kb
id: network.messages.families
alias: websocket messages
alias: message types
source: src/Server/app/Server.js#handleMessage
-->
## Message families

Server traffic is organized into session assignment, lobby lifecycle, complete `game_state`, validated `debug_config`, targeted spectator launch rejection, targeted `game_left`, and terminal `room_closed`. Client actions include reconnect/resync, explicit bot-spectator launch, lobby/leave actions, private host kick, placement, Power, quick chat, and debug update.

Stateful actions are validated against room, identity, current connection, lifecycle, cooldown, and domain rules.

<!-- kb
id: network.messages.latency
alias: latency_ping
alias: latency_pong
alias: RTT
source: src/Server/app/Server.js#handleMessage
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#process_latency_probe
-->
## Latency diagnostics

Latency probes are device-local telemetry. A client nonce is echoed on the same socket; the server does not persist or broadcast RTT. Latency never becomes shared game state.

<!-- kb
id: network.placement.contract
alias: place_block
alias: release row wire
source: src/Server/app/Server.js#handleMessage
source: src/Server/app/engine/Placement.js#resolvePlacementOrigin
adjacent: gameplay.tower.placement
adjacent: hud.placement.snapping
-->
## Placement contract

`place_block` identifies an inventory slot plus intended column and optional release row. The server clamps column to the legal origin range. If a sent release row is still legal, gravity begins there; otherwise the server releases above the tower. Unsnapped and bot placements may omit the row.

Absence must be distinguished before numeric coercion because `Number(null)` becomes zero. Client-only preview matching data never crosses the wire.

<!-- kb
id: network.state.snapshot
alias: game_state
alias: authoritative snapshot
source: src/Server/app/Game_Engine.js#buildGameStateSnapshot
source: src/Server/app/Redis_State.js#stripRuntimeRoom
source: src/Server/app/Game_Engine.js#beginOutcomeSynchronization
adjacent: backend.engine.lifecycle
adjacent: hud.controller.state-application
-->
## Snapshot contract

`game_state` is complete enough to redraw or resume the authoritative room without local
gameplay reconstruction. It carries lifecycle/deadlines, grid and site, inventory/supply, tower
lifecycle and support presentation, component summaries/pose, roster/scores, synchronized visual
hooks, transient event arrays, side quest, summaries, and canonical Impact status.
Observer delivery marks the spectator view and may add one transient bot insight; authoritative
Level Summary may include compact bot behavior totals. Lifecycle timing carries both
`stateRemainingMs` for the active lifecycle deadline and `levelDurationMs` for the authoritative
full round duration, so READY countdown presentation and the paused round clock do not overload
the same value. A completed outcome additionally carries its persisted `roundEndRemainingMs`;
that frozen gameplay value survives room restoration and remains distinct from lifecycle time
until the next level starts.
During an outcome, `outcomeId` and `resultsReady` synchronize the presentation handoff. Connected
human participants may acknowledge only that current server identity after their local gate; the
server starts the Summary window once all are ready or its bounded fallback expires. Bots,
spectators, disconnected, and left players never gate this room lifecycle.

<!-- kb
id: network.state.grid-site
alias: grid width payload
alias: placeable range payload
source: src/Server/app/Game_Engine.js#buildGameStateSnapshot
adjacent: gameplay.tower.site
adjacent: hud.placement.snapping
-->
## Grid and site state

The client derives render center and snapping from transmitted grid/site state. Structural presentation pose does not change canonical aiming or legality.

<!-- kb
id: network.state.impact-status
alias: impactScoreStatus
source: src/Server/app/Game_Engine.js#buildGameStateSnapshot
adjacent: gameplay.impact.eligible
adjacent: hud.players.impact-bars
-->
## Impact status state

`impactScoreStatus` already includes the live eligible contribution exactly once. Clients, bots, and tools consume it directly rather than reconstructing contribution from score totals.

<!-- kb
id: network.state.transient-events
alias: score events
alias: transient event replay
source: src/Server/app/Game_Engine.js#buildGameStateSnapshot
adjacent: hud.overlays.score-popups
adjacent: backend.engine.power-events
-->
## Transient events

Score, chat, and Power events are id-deduplicated transient arrays. They are consumed after broadcast and are not persisted or replayed during recovery. Bot insight is likewise observer-only and broadcast-local; a spectator resync deliberately sends it as null rather than replaying an earlier decision.

<!-- kb
id: network.state.revision
alias: stateRevision
alias: resync_state
source: src/Server/app/Game_Engine.js#buildGameStateSnapshot
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#accept_game_state
adjacent: network.session.recovery
-->
## State revision and resync

`game_state.stateRevision` orders durable state across recovery. Reconnect/resync receives a targeted snapshot without transient events. Either the correlated recovery snapshot or a newer accepted complete game state proves progress before interaction is enabled.

<!-- kb
id: network.adapters.boundaries
alias: wire adapters
alias: network boundaries
source: src/Server/app/Server.js#handleMessage
source: src/Server/app/Lobby_Manager.js#dispatchRoomAction
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#accept_game_state
adjacent: backend.authority.server
-->
## Adapter boundaries

Server Entry parses sockets and forwards actions. Lobby Manager resolves ownership and persistence/routing. Game Engine produces room state without socket or Redis knowledge. Network Manager owns polling, endpoint/reconnect credentials, and shell signals but never game outcomes.

<!-- kb
id: network.compatibility.deploy-together
alias: wire compatibility
alias: mixed version
source: src/Server/app/Game_Engine.js#buildGameStateSnapshot
source: src/Server/app/Redis_State.js#stripRuntimeRoom
-->
## Compatibility boundary

Client, server, wire fields, and persisted room shape deploy together. There is no general mixed-version guarantee for an in-flight room. Moving a cross-boundary field requires producer, persistence, consumer, routing docs, and focused verification to move together.
