# Backend

Scope: authoritative server architecture, room lifecycle, game-rule ownership,
shared state, and nonlocal implementation constraints. Wire behavior →
[networking.md](./networking.md). Design meaning → [gameplay.md](./gameplay.md).
Source navigation → [map/backend.md](./map/backend.md).

All runtime modules live under `src/Server/app/`.

## Authority and module boundaries

`Game_Engine.js` is the facade for one room. Placement, supply, scoring, and
Impact logic are plain-function modules under `engine/`; their first argument is
the owning engine and callers use the facade rather than importing those modules
directly. `Block_Geometry.js` and `Tower_Stability.js` are pure exceptions with no
room state. The engine never reads Redis; Lobby Manager persists and restores it.

The server alone decides placement, stability, scoring, failure, progression,
Power, and room closure. Clients and tools render or preview those decisions from
the same authoritative contracts.

Four-way contact partitions standing bricks into independent stability and pose
components; gravity and load follow downward contacts. Overload removes its
support and groups with no ground path, preserving strong bases and disconnected
towers. The tallest controls height. Collapse alone stays active. Threatened
supply consumes bot-held Replenish, waits on human-held Replenish, and fails
without rescue; Timer expiry and unmet Impact also fail.

## Lobby Manager

Lobby Manager owns connection-to-room assignment, ready-up, reconnect, debug-room
coordination, persistence callbacks, and cross-pod routing. Rooms have three
seats, may include debug bots, and start only when full and ready. Started rooms
can resume during the reconnect TTL; an empty real-player room is destroyed
rather than continued by bots.

Only the Redis lease owner mutates a room, runs timers, recomputes stability, or
persists state. Other pods may hydrate a frozen presentation replica and relay
broadcasts, but gameplay actions are republished to the owner. Treating a remote
snapshot as writable creates divergent towers.

Open-room seating runs under the matchmaking lock. Claiming pops the room id;
when the claiming pod cannot own that room it must put the id back before trying
another. Terminal close is owner-published before deletion. Remote replicas
forward it once and discard local state without deleting owner state; teardown
must suppress later persistence callbacks so a closed room cannot be resurrected.

### Identity and profiles

Auth Verifier uses `jose` to validate Supabase JWTs and validates native Facebook tokens without
throwing. Account Store converts a verified credential into the stable game
account id, so a claimed wire `profileId` cannot override verified identity.
Facebook identities persist only as versioned HMACs; raw provider ids and access
tokens never enter the database. Browser and native Facebook converge on the same
provider subject and account.

Profile Store reads and stamps durable profiles when service credentials exist;
the stored display name wins. Without persistence or during an outage it falls
back to a deterministic generated name. Account status is transported but not
enforced here. Redis remains active-session storage, not profile storage.

### Debug configuration

`Debug_Config.js` is the write boundary for runtime tuning. It rejects unknown
keys, clamps values, enforces enum allowlists and dependent bounds, then Lobby
Manager reconciles affected rooms and broadcasts the authoritative snapshot.
Settings are debug state, not player progression.

`towerStabilityDifficulty` is the only writable stability dial; derived physics
constants have no setters. Grid bounds remain limited by the client viewport and
the derived site is forced even so odd debug inputs cannot move it off-center.
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

Last Chance is a debug-only rescue: the first collapsing placement becomes a
one-percent pending state and the next placement must recover above it. Only a
placement evaluation may spend it; passive recalculation cannot.

### Power and transient events

Power activation has no target and applies its effect room-wide. Replenish grows
the shared pile once; a held Replenish can defer an otherwise unavoidable
not-enough-height failure. Power inventory participates in Impact snapshots.

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

A centered bottleneck can therefore lose Integrity without inventing a lean
direction. Difficulty zero suppresses gameplay risk while retaining diagnostics.
Opening maturity and height pressure prevent shape-specific opening exceptions
while allowing weak interfaces to become dangerous later.

Structural pose is presentation output only. It never changes coordinates,
gravity, snapping, scoring inputs, or collapse. `balanceDelta` is the directional
Balance change stamped on a placed brick; Integrity does not drive brick faces.

## Bot Manager

Bots are QA/demo schedulers, not a second game authority. They enumerate legal
brick, column, and release-row combinations, preview them through the engine, and
place through the same path as players. A cheap shortlist bounds the expensive
support-graph evaluations.

Ranking must use the authoritative score transaction rather than height gain;
otherwise zero-height gap repairs are unreachable. Cooperative bots may wait
after satisfying their own Impact share so another player can claim scarce
height, but only when no useful repair remains. Callers must handle both place
and wait actions.

Bot collapse rate is not a stability calibration signal because candidate search
rejects collapsing moves. Use per-placement stability distributions and Impact
outcomes instead.

## Configuration and Redis

`Game_Config.js` owns current values; docs own their meaning. Target height,
clock, supply, stability, scoring, site, Power, and bot behavior derive from that
single object. Do not mirror routine values into prose or expose raw derived
physics controls merely for debug convenience.

Development and demo servers enable the latency indicator and live stability
preview by default. EKS explicitly disables both diagnostics in its game-pod
environment so it cannot inherit the development presentation defaults.

Redis State supplies open-room claims, the matchmaking lock, room leases,
snapshots, per-room broadcasts/actions, player assignment, and demo counters. It
falls back to in-memory state when Redis is absent. Only a bounded draw-pile
prefix is stored; hydration regenerates its hidden tail because only the next
draw is observable. Tower pose and lifecycle/accounting state needed for
continuity are persisted, but full stability analysis is not. Historical height,
claimed Recovery rows, and rewarded repair boundaries persist so reconnect or
pod handoff cannot reopen scoring history.

## Known gaps

- Durable profiles contain no leaderboard scores; Redis is active-session state.
- Cross-pod seating and close have regression coverage, but broader reconnect
  and gateway routing lack integration coverage.
- Client, server, wire fields, and persisted room shape must deploy together;
  split-version hydration is not a compatibility boundary.
