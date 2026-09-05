# Backend

Scope: authoritative server architecture, room lifecycle, rule ownership, persistence boundaries, and nonlocal implementation constraints. Player-facing meaning lives in `gameplay.md`; cross-boundary payload behavior lives in `networking.md`.

<!-- kb
id: backend.authority.server
alias: server authoritative
source: src/Server/app/Game_Engine.js#buildGameState
adjacent: network.adapters.boundaries
-->
## Server authority

The server decides scoring, legality, stability, failure, progression, and room outcomes. Clients and tools may render or preview those results but do not become an alternate authority.

<!-- kb
id: backend.authority.engine
alias: Game Engine ownership
source: src/Server/app/Game_Engine.js#GameEngine
-->
## Game Engine boundary

`Game_Engine.js` is the room facade. Engine modules take the owning engine first and ordinary callers do not import them directly. Pure geometry/stability helpers are deliberate exceptions. Game Engine produces durable room state without owning Redis or socket transport.

<!-- kb
id: backend.authority.persistence
alias: Redis ownership
alias: room persistence authority
source: src/Server/app/Lobby_Manager.js#hydrateRoom
source: src/Server/app/Redis_State.js#saveRoom
adjacent: backend.redis.leases
-->
## Persistence ownership

Lobby Manager is the server layer allowed to persist and restore room state. Redis State supplies shared storage and routing, while Game Engine remains free of Redis knowledge. Only the lease owner mutates authoritative room state or runs authoritative timers.

<!-- kb
id: backend.lobby.connection
alias: connection id ownership
alias: superseded socket
source: src/Server/app/Lobby_Manager.js#isCurrentPlayerConnection
source: src/Server/app/Redis_State.js#isCurrentSessionConnection
adjacent: network.session.supersession
-->
## Session connection ownership

Actions and disconnect cleanup are accepted only from the session's current opaque connection id. A superseded socket cannot invalidate or clear a resumed seat.

<!-- kb
id: backend.lobby.public
alias: public matchmaking room
alias: matchmaking
source: src/Server/app/Lobby_Manager.js#joinOrCreateRoom
source: src/Server/app/Redis_State.js#withMatchmakingLock
adjacent: network.room.public
-->
## Public matchmaking

Public rooms have three seats and may include debug bots. They start only when full and ready. Open-room seating runs under the matchmaking lock, and a pod that claims a room it cannot own must return the id before trying another.

<!-- kb
id: backend.lobby.private
alias: private lobby
alias: private server room
source: src/Server/app/Lobby_Manager.js#createPrivateRoom
adjacent: network.room.private
-->
## Private rooms

Private rooms reserve three human seats and never enter public matchmaking or bot fill. Invite, fixed host, readiness, connection phases, and deadlines persist. The host alone may kick. Transport loss unreaddies and reserves a seat through recovery rather than treating it as an intentional leave.

<!-- kb
id: backend.lobby.cross-pod
alias: multi pod room
alias: lease owner
source: src/Server/app/Lobby_Manager.js#dispatchRoomAction
source: src/Server/app/Redis_State.js#claimRoomLease
adjacent: backend.redis.leases
adjacent: network.room.cross-pod
-->
## Cross-pod ownership

Only the Redis lease owner mutates a room, recomputes authoritative state, runs timers, or persists. Other pods may hydrate a frozen presentation replica and relay broadcasts, while gameplay actions are republished to the live owner.

<!-- kb
id: backend.lobby.close
alias: room closed
alias: room teardown
source: src/Server/app/Lobby_Manager.js#closeRoom
adjacent: network.room.close
-->
## Terminal room close

Terminal close is published by the owner before deletion. Remote replicas forward it once and discard their local replica without deleting owner state. Teardown suppresses later persistence callbacks so a closed room cannot be resurrected.

<!-- kb
id: backend.lobby.active-leave
alias: leave game
alias: active leave
source: src/Server/app/Lobby_Manager.js#leaveGameForRoom
adjacent: network.room.active-leave
-->
## Intentional active leave

An intentional active-match leave clears only the leaving connection's session-room binding. The started engine roster retains that participant and history as a left/disconnected presentation state; survivors are not assigned a replacement.

<!-- kb
id: backend.identity.auth
alias: authentication
alias: Supabase auth
alias: Facebook auth
source: src/Server/app/Auth_Verifier.js#verifyAccessToken
adjacent: network.session.identity
-->
## Identity verification

Auth Verifier validates configured Supabase JWTs and native Facebook access tokens without turning provider claims into game authority. Verified identity overrides claimed wire profile identity when authentication is available.

<!-- kb
id: backend.identity.profile
alias: profile store
alias: account store
source: src/Server/app/Account_Store.js#resolve
source: src/Server/app/Profile_Store.js#getProfile
-->
## Durable profiles

Account Store converts verified provider identity into durable account identity and stores Facebook subjects only as versioned HMACs. Profile Store supplies durable profile data when configured; otherwise it degrades to deterministic generated presentation. Redis remains active-session storage rather than durable profile storage.

<!-- kb
id: backend.lobby.debug-config
alias: runtime debug config
alias: runtime tuning
source: src/Server/app/Debug_Config.js#applyValue
source: src/Server/app/Lobby_Manager.js#updateDebugConfig
adjacent: gameplay.debug.tuning
-->
## Debug configuration

`Debug_Config.js` is the live-write boundary for server tuning. It rejects unknown keys, clamps values, enforces allowed values and dependent bounds, then Lobby Manager reconciles affected rooms and broadcasts the authoritative snapshot.

Live-writable tuning, designer-authored calibration, and true contracts are different classes. Derived physical constants are not exposed simply because a debug UI exists.

<!-- kb
id: backend.engine.lifecycle
alias: game state lifecycle
source: src/Server/app/Game_Engine.js#startLevel
adjacent: network.state.snapshot
-->
## Engine lifecycle

Game Engine owns waiting, starting, playing, finished, failed, game-over, completed, and closed room states. Game over accepts no gameplay actions and is limited to terminal presentation and close timing.

<!-- kb
id: backend.engine.timers
alias: server timers
alias: room deadlines
source: src/Server/app/Game_Engine.js#restoreTimersFromState
adjacent: gameplay.progression.timing
-->
## Engine timers

The active deadline is stored with room state so presentation time and failure timers cannot diverge. Start, play, post-level freeze, and terminal close use their own deadlines. Hydration restores only the timer appropriate to persisted state and only on the current lease owner.

<!-- kb
id: backend.engine.placement
alias: placement validation
alias: release row server
source: src/Server/app/engine/Placement.js#placeBlock
adjacent: gameplay.tower.placement
adjacent: network.placement.contract
-->
## Placement authority

A legal intended release row starts gravity there; an absent or stale/illegal row falls back to release above the tower. Support is not a legality rule. Column input is clamped so the full brick footprint remains inside the derived site.

Production evaluators must receive the resolved stability configuration for the active level. Bypassing that resolution makes preview/ranking disagree with authoritative awards.

<!-- kb
id: backend.engine.last-chance
alias: last chance
source: src/Server/app/engine/Last_Chance.js#resolve
adjacent: gameplay.debug.last-chance
-->
## Last Chance authority

Last Chance is a one-placement debug rescue. Spending it is an explicit placement-time action; passive stability recalculation cannot consume it.

<!-- kb
id: backend.engine.power-events
alias: Power events
alias: transient events
source: src/Server/app/Game_Engine.js#activatePower
adjacent: network.state.transient-events
-->
## Power events

Power activation is room-wide and targetless. Replenish changes shared supply. Power inventory participates in Impact snapshots. Score, quick-chat, and Power events are transient broadcast queues and are not persisted or reconstructed from score differences.

<!-- kb
id: backend.supply.authority
alias: Block Supply
source: src/Server/app/engine/Block_Supply.js#buildDrawPile
adjacent: gameplay.supply.reserve
-->
## Supply authority

Block Supply owns the available shapes, random dealt orientation, opening hands, shared draw pile, replenishment, reserve sizing, and carry-over. Reserve generation derives from target, site, geometry, and packing assumptions while failure uses optimistic physical reachability rather than packing efficiency.

<!-- kb
id: backend.scoring.transaction
alias: Scoring.js
alias: placement scoring
source: src/Server/app/engine/Scoring.js#addPlacementScore
adjacent: gameplay.scoring.transaction
-->
## Scoring transaction

Scoring owns authoritative placement preview and award. Useful height, rebuild recovery, direct structural repair, and qualifying Critical Save are resolved as one placement transaction with component accounting shared between preview and award.

<!-- kb
id: backend.impacts.requirement
alias: Impacts.js
alias: Impact status
source: src/Server/app/engine/Impacts.js#getImpactScoreStatus
adjacent: gameplay.impact.requirement
adjacent: network.state.impact-status
-->
## Impact authority

Impacts owns checkpoint snapshots, personal contribution requirements, retry accounting, rollback, and terminal Impact failure. `impactScoreStatus` is the canonical consumer view and already combines banked and live contribution correctly.

<!-- kb
id: backend.impacts.rollback
alias: Impact rollback
source: src/Server/app/engine/Impacts.js#rollbackToImpact
adjacent: gameplay.progression.rollback
-->
## Impact rollback

Recoverable failure restores checkpoint score, eligible contribution, and Power while preserving retry count. Only securing the next checkpoint resets retries. Terminal failure restores the checkpoint once, broadcasts game over, and closes toward Home.

<!-- kb
id: backend.stability.analysis
alias: stability analyzer
alias: support graph
source: src/Server/app/Tower_Stability.js#evaluate
adjacent: gameplay.tower.stability
-->
## Support graph

Tower Stability is deterministic support-graph analysis over supplied geometry
and configuration. Carried mass and moment propagate through contacts. Overall
stability is the minimum of Balance and Integrity, allowing both directional
lean failures and centered load-path bottlenecks. It owns no room state,
persistence, transport, or I/O.

<!-- kb
id: backend.stability.collapse
alias: tower collapse
alias: collapse components
source: src/Server/app/Tower_Stability.js#collapseSlice
source: src/Server/app/engine/Placement.js#collapseComponents
adjacent: hud.tower.collapse.presentation
adjacent: gameplay.progression.failure
-->
## Collapse authority

Overloaded support removal and ground-path loss determine fallen groups authoritatively. Collapse does not itself fail a level. Pose and presentation may reflect structural results but do not alter canonical geometry.

<!-- kb
id: backend.stability.pose
alias: server structural pose
source: src/Server/app/Tower_Stability.js#buildStructuralPose
adjacent: hud.tower.pose
-->
## Structural pose

Pose pivots dependent presentation sections at stressed interfaces while leaving unrelated grounded sections independent. It never changes coordinates, gravity, snapping, scoring, or collapse calculation.

<!-- kb
id: backend.bots.preview
alias: Bot Manager
alias: bot candidate preview
source: src/Server/app/Bot_Manager.js#chooseBotAction
adjacent: gameplay.bots.scoring
-->
## Bot preview

Bots enumerate legal brick, column, and release-row combinations, preview through the real engine, and place through the same action path as players. A bounded shortlist limits expensive support-graph evaluation.

<!-- kb
id: backend.config.values
alias: Game Config
alias: tuning values
source: src/Server/app/Game_Config.js#GameConfig
-->
## Configuration ownership

`Game_Config.js` owns current server values while semantic docs own their meaning. Target height, clock, supply, stability, scoring, site, Power, bots, and room timing derive from that configuration. Routine values should not be mirrored into prose.

<!-- kb
id: backend.redis.leases
alias: Redis State
alias: room lease
source: src/Server/app/Redis_State.js#claimRoomLease
adjacent: backend.lobby.cross-pod
-->
## Redis leases

Redis State owns open-room claims, matchmaking locking, room leases, snapshots, per-room broadcasts/actions, player assignment, and shared demo counters. Without Redis it falls back to single-process memory, which is valid only for single-worker use.

<!-- kb
id: backend.redis.hydration
alias: room hydration
alias: persisted room
source: src/Server/app/Redis_State.js#saveRoom
source: src/Server/app/Lobby_Manager.js#hydrateRoom
adjacent: network.state.snapshot
-->
## Hydration continuity

Persistence carries the durable room shape required to resume gameplay: tower/lifecycle/accounting state, deadlines, historical height, rebuild tracking, and presentation continuity. Hidden draw-pile tail state may be regenerated where only the observable next draw is contractually significant.
