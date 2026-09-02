# Backend

Scope: authoritative server architecture, room lifecycle, game-rule ownership,
shared state, and nonlocal implementation constraints. Wire behavior →
[networking.md](./networking.md). Design meaning → [gameplay.md](./gameplay.md).
Source navigation → [map/backend.md](./map/backend.md).

All runtime modules live under `src/Server/app/`.

## Authority and module boundaries

`Game_Engine.js` is the room facade; its `engine/` modules take the owner first
and callers do not import them directly. `Block_Geometry.js`,
`Tower_Load_Capacity.js`, and `Tower_Stability.js` are pure exceptions, and only
Lobby Manager persists or restores room state. The server decides all game
outcomes; clients and tools only render or preview them.

Lobby Manager and Redis accept actions or cleanup only from a session's current
connection id, preventing a superseded socket from clearing a resumed seat. Game
Engine builds durable snapshots separately from broadcasts. Rebuild decay
survives resumes until the tower reaches a new height target.

Four-way contact separates stability and pose components; per-cell mass flows
down independent paths against physical contact capacity. A deterministic lateral pass
redirects a bounded share only through independently grounded side contacts, conserves
mass and moment, and debits one residual-capacity ledger across shared supports. Scoring
credits accepted bracing once while collapse dependency remains downward. Difficulty
tightens geometry and overload limits, but target height never raises capacity; zero
keeps diagnostics while suppressing collapse risk. Overload removes failed supports and
groups without a ground path, preserving disconnected towers.
Collapse alone stays active. Supply consumes bot-held Replenish, waits on a
human-held one, and fails without rescue; Timer expiry and unmet Impact also fail.

## Lobby Manager

Lobby Manager owns connection-to-room assignment, ready-up, reconnect, debug-room
coordination, persistence callbacks, and cross-pod routing. Rooms have three
seats, may include debug bots, and start only when full and ready. Started rooms
can resume during the reconnect TTL; an empty real-player room is destroyed
rather than continued by bots.

An intentional active-match leave is owner-routed and clears only the leaver's
session-room binding. The started engine roster retains that participant as
disconnected, without replacement or a terminal close for survivors.

Private rooms contain three human seats and never enter open matchmaking or bot
fill. Their invite, fixed host, readiness, connection phases, and deadlines
persist. The host alone may kick; full connected readiness arms a separate start
deadline, while transport loss unreaddies and reserves that seat through expiry.

Only the Redis lease owner mutates a room, runs timers, recomputes stability, or
persists state. Other pods may hydrate a frozen presentation replica and relay
broadcasts, but gameplay actions are republished to the owner. Treating a remote
snapshot as writable creates divergent towers; an expired idle lease still
routes to a healthy snapshot owner.

Open-room seating runs under the matchmaking lock. Claiming pops the room id;
when the claiming pod cannot own that room it must put the id back before trying
another. Terminal close is owner-published before deletion. Remote replicas
forward it once and discard local state without deleting owner state; teardown
must suppress later persistence callbacks so a closed room cannot be resurrected.

### Identity and profiles

Auth Verifier uses `jose` to validate Supabase JWTs and native Facebook tokens without
throwing. Account Store makes verified identity override wire `profileId` and
persists Facebook identities only as versioned HMACs; raw provider ids and access
tokens never enter the database.

Profile Store reads and stamps durable profiles when service credentials exist;
the stored display name wins. Without persistence or during an outage it falls
back to a deterministic generated name. Account status is transported but not
enforced here. Redis remains active-session storage, not profile storage.

### Debug configuration

`Debug_Config.js` is the write boundary for runtime tuning. It rejects unknown
keys, clamps values, enforces enum allowlists and dependent bounds, then Lobby
Manager reconciles affected rooms and broadcasts the authoritative snapshot.
The tunable registry distinguishes that live-writable surface from designer-only
source calibration and true contracts; derived tower-site width remains
designer-authored `Game_Config.js` tuning.
Stability difficulty and lateral brace share are independent writable dials: difficulty
controls overload tolerance, while brace share caps sideways load. Changing either
invalidates cached analysis so the next authoritative evaluation uses the new tuning
without fabricating a physics event; derived physics constants have no setters. Grid
bounds remain limited by the client viewport and the derived site is forced even so odd
debug inputs cannot move it off-center.
Visual-hook durations travel through `game_state`, while their enablement and
other exposed controls use the debug snapshot. Restart is an action, not a
tunable. Recovery scoring is a server-applied percentage; the client control
sends bounded intent and never calculates points.

## Game Engine

The engine owns room state, block dealing, level states and timers, placement and
Power validation, score/event production, progression, and persistence
notifications. Its level states are waiting, starting, playing, finished, failed,
game over, completed, and closed. Game over accepts no gameplay action and has
only its terminal close timer.

The level clock is derived from target height and placement throughput, then
stored on the room so the deadline and fail timer cannot disagree. Remaining time
is state-specific: start, play, post-level freeze, and terminal close count down
their own deadlines. Hydration restores only the timer matching persisted state,
and only on the lease owner.

### Placement and stability configuration

A valid aimed row is a release row: gravity starts there and resolves first
contact. An absent or stale/illegal row falls back to release above the tower.
Support is not a legality rule, which keeps internal gaps repairable. Column input
is clamped so the brick's full footprint remains inside the level-derived site.

`Number(null)` is `0`; test absence before numeric coercion or an origin-less
placement becomes an unintended row-zero aim.

Every production evaluator—engine, bots, and balance tools—must receive
`resolveStabilityConfig(level)`. Passing raw config bypasses level pressure, site
width, difficulty scaling, and pose limits and makes preview/ranking disagree with
the authoritative award path.

Last Chance is a debug-only one-placement rescue; passive recalculation cannot
spend it.

### Power and transient events

Power activation has no target and applies its effect room-wide. Replenish adds
its configured share of start-pile capacity once; a held Replenish can defer
an otherwise unavoidable not-enough-height failure. Power inventory participates
in Impact snapshots.

Score, quick-chat, and Power events are transient broadcast queues. They are not
persisted or reconstructed from score differences.

## Supply, scoring, and Impacts

Block Supply owns the five tetromino shapes, random dealt orientation, opening
hands, shared draw pile, refresh, and carry-over. Reserve sizing is derived from
target height, site width, brick geometry, and packing efficiency. Failure checks
use the optimistic physical height still available, not packing efficiency;
otherwise the server declares winnable levels impossible. Carry-over is precision
first on success and discarded on failure.

Scoring accumulates level score before banking it into the leaderboard. Each
placement produces one capped authoritative transaction from useful height,
introduced risk, direct structural repair, and any qualifying Critical Save.
Preview and award share the calculation. Eligible Impact contribution includes
only capped useful placement components, not completion or presentation bonuses.

Impacts owns checkpoint snapshots, personal contribution requirements, retries,
rollback, and terminal failure. `impactScoreStatus` is the canonical client/bot
view; consumers must not rebuild it from score fields. A completed level banks
its live contribution before the next band is evaluated. Every recoverable
failure restores checkpoint score, contribution, and Power while preserving the
retry count; only securing the next checkpoint resets it. Terminal failure
restores the checkpoint once, broadcasts game over, and requests Home closure.
Failure summaries preserve the authoritative reason so presentation can
distinguish an Impact-score shortfall from an ordinary level failure.

## Tower Stability

Tower Stability is deterministic support-graph analysis. Gravity and legality
operate on grid geometry; evaluation propagates carried mass and moment through
support contacts. Stability is the minimum of two axes:

- Balance measures carried-load center against immediate contact span.
- Integrity measures whether contact width and independent support paths can
  carry their load.

A centered bottleneck can lose Integrity without an invented lean; real carried-
load bias gives either axis its direction. Difficulty zero retains diagnostics
without gameplay risk, while maturity and height pressure replace shape-specific
exceptions.

Each standing block receives its support group's worst meaningful responsibility;
connecting components recomputes both graphs. Pose pivots dependent sections at
the stressed interface and leaves unrelated grounded sections independent. It
never changes coordinates, gravity, snapping, scoring, or collapse. `balanceDelta`
is only the placed brick's entrance reaction.

## Bot Manager

Bots are QA/demo schedulers, not a second game authority. They enumerate legal
brick, column, and release-row combinations, preview them through the engine, and
place through the same path as players. A cheap shortlist bounds the expensive
support-graph evaluations.

Ranking must use the authoritative score transaction rather than height gain;
otherwise zero-height gap repairs are unreachable. Cooperative bots may wait
after satisfying their own Impact share so another player can claim scarce
height, but only when no useful repair remains. Callers must handle both place
and wait actions. Zero-height repairs below the normal tower view floor are not
candidates; height-building moves remain available so bots cannot repair history
that a player can no longer see.

Bot collapse rate is not a stability calibration signal because candidate search
rejects collapsing moves. Use per-placement stability distributions and Impact
outcomes instead.

## Configuration and Redis

`Game_Config.js` owns current values; docs own their meaning. Target height,
clock, supply, stability, scoring, site, Power, and bot behavior derive from that
single object. Do not mirror routine values into prose or expose raw derived
physics controls merely for debug convenience.

Development enables latency and live stability diagnostics. The public demo and
EKS select warning-only stability feedback; EKS also disables latency.

Redis State supplies open-room claims, the matchmaking lock, room leases,
snapshots, per-room broadcasts/actions, player assignment, and demo counters. It
falls back to in-memory state when Redis is absent. Only a bounded draw-pile
prefix is stored; hydration regenerates its hidden tail because only the next
draw is observable. Continuity persists tower pose, lifecycle/accounting, each
brick's last support stability, historical height, and rebuild count, but not
full stability analysis.

## Known gaps

- Durable profiles contain no leaderboard scores; Redis is active-session state.
- Cross-pod seating and close have regression coverage, but broader reconnect
  and gateway routing lack integration coverage.
- Client, server, wire fields, and persisted room shape must deploy together;
  split-version hydration is not a compatibility boundary.
