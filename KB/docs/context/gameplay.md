# Gameplay

Scope: player-facing game rules, design meaning, progression, scoring semantics, and bot behavior. Server implementation lives in `backend.md`; wire behavior lives in `networking.md`. `Game_Config.js` owns current tuning values; these sections own what those knobs mean.

<!-- kb
id: gameplay.core.loop
alias: selfish cooperation
alias: core gameplay loop
source: src/Server/app/Game_Engine.js#@file
adjacent: gameplay.impact.requirement
adjacent: gameplay.progression.failure
-->
## Core loop

Corp Tower is a three-player real-time selfish-cooperation tower puzzle. Players compete for individual score and MVP while building one shared tower. Each player receives server-assigned bricks, places on the same authoritative grid, refills from one shared draw pile, and waits through a personal placement cooldown.

A level ends when the target is reached or a failure rule fires. Useful height is finite and individually claimed, while Impact checkpoints require every player to satisfy a personal contribution requirement. One player's surplus never covers another player's deficit, keeping selfish scoring and team survival in tension.

<!-- kb
id: gameplay.session.reconnect
alias: resume gameplay
alias: reconnect seat
source: src/Server/app/Lobby_Manager.js#@file
adjacent: network.session.recovery
-->
## Reconnect meaning

Reconnect preserves the same player seat and authoritative room while server recovery remains valid. The client may offer different input methods, but both submit the same server placement intent; reconnection does not create a new gameplay authority.

<!-- kb
id: gameplay.supply.bricks
alias: tetromino supply
alias: brick shapes
source: src/Server/app/engine/Block_Supply.js#@file
-->
## Brick dealing

Five four-cell shapes are available from the start. Orientation is randomized when dealt and cannot be rotated by the player. Effective height comes from the dealt cell geometry rather than the shape name or cell count. Early levels expose two hand slots and later levels three.

<!-- kb
id: gameplay.supply.reserve
alias: draw pile
alias: reserve sizing
alias: not enough height
source: src/Server/app/engine/Block_Supply.js#@file
source: src/Server/app/engine/Placement.js#@file
adjacent: gameplay.power.replenish
adjacent: gameplay.progression.failure
-->
## Shared supply

The shared draw pile exposes the next draw, which goes to the next player who successfully places. Each level combines successful carry-over with a generated reserve sized from target height, placeable width, brick geometry, and expected packing efficiency. Early levels intentionally have surplus while later coverage tightens.

Opening hands obey solvability constraints. Failure from insufficient remaining height uses optimistic physical height, not packing efficiency, and waits while a held Replenish can still rescue supply.

<!-- kb
id: gameplay.supply.carry-over
alias: carry over bricks
source: src/Server/app/engine/Block_Supply.js#@file
-->
## Carry-over

Successful levels carry unused bricks forward with precision priority. Failed levels discard carry-over so repeated attempts cannot accumulate an unintended stock advantage.

<!-- kb
id: gameplay.power.inventory
alias: Power items
alias: power inventory
source: src/Server/app/Game_Engine.js#@file
source: src/Server/app/engine/Impacts.js#@file
adjacent: gameplay.progression.rollback
-->
## Power inventory

Power and the shared side quest unlock through normal play. Earned inventory persists within the current Impact band and is restored from that checkpoint snapshot on rollback, preventing failed-attempt farming.

<!-- kb
id: gameplay.power.replenish
alias: refresh
alias: free_refresh
source: src/Server/app/Game_Engine.js#@file
source: src/Server/app/engine/Block_Supply.js#@file
adjacent: gameplay.supply.reserve
-->
## Replenish

Replenish is an instant room-wide Power with no target. It adds fresh bricks to the shared pile without disturbing the visible next draw. A held Replenish may defer an otherwise unavoidable supply failure while it can still rescue the run. Other implemented effects may remain inactive tuning options rather than normal play.

<!-- kb
id: gameplay.tower.site
alias: tower site
alias: placeable range
alias: grid width
source: src/Server/app/Game_Config.js#@file
source: src/Server/app/engine/Placement.js#@file
adjacent: network.state.grid-site
-->
## Placeable site

Target height grows without a cap. Placeable width is derived from the target, clamped to the visible tower grid, forced even, and centered. Height pressure and footprint therefore evolve from one curve rather than separate tables. A brick's full footprint must remain inside the active site.

<!-- kb
id: gameplay.tower.placement
alias: release row
alias: gap placement
alias: overhang
source: src/Server/app/engine/Placement.js#@file
adjacent: network.placement.contract
adjacent: hud.placement.snapping
-->
## Release row and gravity

A snapped row is the release row, not necessarily the brick's resting row. Gravity still resolves first contact, so reachable gaps can be repaired and unsupported aims fall instead of floating. Overhangs are legal and are the primary surface for the stability mechanic. Overbuilding remains a valid finish, but excess height is not useful Height score and loses exact-finish rewards.

<!-- kb
id: gameplay.tower.stability
alias: tower stability
alias: Balance and Integrity
alias: weak support
source: src/Server/app/Tower_Stability.js#@file
adjacent: backend.stability.analysis
adjacent: gameplay.scoring.reinforcement
adjacent: gameplay.scoring.critical-save
-->
## Stability design

The support graph produces Balance and Integrity; overall tower stability is the weaker axis. Balance measures carried-load lean against contact span. Integrity measures whether contact width and independent support paths can carry the load, allowing a centered bottleneck to fail without inventing a directional warning.

`towerStabilityDifficulty` is the single gameplay stability dial. It changes geometric pressure and physical load tolerance while target height does not increase contact capacity. Mature narrow supports therefore need reinforcement as supported mass grows. Repair can reduce risk, earn structural value, and qualify for Critical Save.

<!-- kb
id: gameplay.tower.pose
alias: tower pose
alias: structural pose
source: src/Server/app/Tower_Stability.js#@file
adjacent: hud.tower.pose
-->
## Structural pose meaning

The client may render an authoritative presentation-only structural pose, but pose never changes legality, snapping, scoring, gravity, or collapse authority. It exists to present structural stress while canonical grid coordinates remain the gameplay contract.

<!-- kb
id: gameplay.progression.timing
alias: round timer
alias: level clock
source: src/Server/app/Game_Config.js#@file
source: src/Server/app/Game_Engine.js#@file
adjacent: backend.engine.timers
adjacent: network.session.recovery
-->
## Round timing

The round clock derives from target height, expected human packing efficiency, player count, cooldown, and level slack. It grows with the tower rather than using one flat duration. Reconnect TTL is independent, so a late-game round can outlast a disconnected player's recovery window.

<!-- kb
id: gameplay.progression.failure
alias: level failure
alias: timer failure
alias: supply failure
source: src/Server/app/Game_Engine.js#@file
source: src/Server/app/engine/Placement.js#@file
source: src/Server/app/engine/Impacts.js#@file
adjacent: gameplay.supply.reserve
adjacent: gameplay.impact.requirement
-->
## Failure rules

A level fails when the timer expires, a personal Impact contribution checkpoint is unmet, supply is exhausted, or remaining bricks cannot reach the target. Replenish can defer the supply condition while it can still rescue the run. Collapse and lost height alone do not fail the level.

<!-- kb
id: gameplay.progression.rollback
alias: checkpoint rollback
alias: retry band
source: src/Server/app/engine/Impacts.js#@file
adjacent: gameplay.impact.requirement
adjacent: backend.impacts.rollback
-->
## Impact rollback

Each Impact band begins at a secured checkpoint. Recoverable failure restores checkpoint score, eligible contribution, and Power inventory while preserving retry count. Securing the next checkpoint is the only reset. Exhausting the retry budget becomes terminal game over.

<!-- kb
id: gameplay.scoring.transaction
alias: placement score
alias: score transaction
source: src/Server/app/engine/Scoring.js#@file
adjacent: backend.scoring.transaction
-->
## Placement transaction

Every settled brick produces one authoritative placement transaction. Useful score components are awarded from authoritative placement outcomes; a placement that drops a brick earns no placement or Impact points. Height/Recovery and structural Reinforce are independent components rather than sharing one transaction cap.

<!-- kb
id: gameplay.scoring.height
alias: height score
alias: new height
source: src/Server/app/engine/Scoring.js#@file
-->
## Height

Rows above the level's historical maximum earn Height once, but only through the target. Overbuild can finish a level, yet excess rows are worthless for useful Height and lose exact-finish rewards.

<!-- kb
id: gameplay.scoring.recovery
alias: recovery score
alias: rebuild score
source: src/Server/app/engine/Scoring.js#@file
-->
## Recovery

Rebuilding lost rows earns Recovery at the configured share, then a further reduced share for repeated rebuilds until the tower establishes a new height target. Recovery is distinct from first-time Height and can coexist with structural Reinforce.

<!-- kb
id: gameplay.scoring.reinforcement
alias: reinforcement scoring
alias: reinforce
alias: structural repair score
source: src/Server/app/engine/Scoring.js#@file
adjacent: gameplay.tower.stability
adjacent: gameplay.scoring.critical-save
-->
## Reinforcement

Direct surviving repairs on the active tallest tower earn Reinforce from measured structural benefit. Orientation alone earns nothing, and repairs to other components do not qualify. Rebuild Reinforce follows rebuild decay, while direct structural repair remains an independent scoring component.

<!-- kb
id: gameplay.scoring.critical-save
alias: critical save
alias: save scoring
alias: worried support rescue
source: src/Server/app/engine/Scoring.js#@file
adjacent: gameplay.tower.stability
adjacent: hud.tower.weak-support
-->
## Critical Save

A Critical Save is a zero-Height, zero-Recovery rescue of the same visible support that drives the worried-brick feedback. The support begins in the authoritative critical band and the directly attributed repair moves it above that threshold while satisfying maturity, risk, load, claim, Last Chance, survival, and per-level protections.

The configured Critical Save payout replaces ordinary Reinforce for that rescue rather than stacking a duplicate structural payout.

<!-- kb
id: gameplay.scoring.exact-finish
alias: exact finish
alias: exact height reward
source: src/Server/app/engine/Scoring.js#@file
source: src/Server/app/engine/Impacts.js#@file
adjacent: gameplay.impact.checkpoint-credit
-->
## Exact finish

An exact finish separately rewards only the finisher and grants every player a configured share of their current Impact-band requirement, capped at remaining need. Unused credit does not enter the next band. Overbuild receives neither exact-finish reward.

<!-- kb
id: gameplay.impact.eligible
alias: Impact contribution
alias: eligible score
source: src/Server/app/engine/Impacts.js#@file
source: src/Server/app/engine/Scoring.js#@file
adjacent: network.state.impact-status
-->
## Eligible contribution

Every awarded placement component contributes to Impact at its awarded value. Completion, MVP, Power, presentation bonuses, and other non-placement rewards do not. Level score and live contribution bank only on success, while `impactScoreStatus` combines banked and live eligible contribution exactly once.

<!-- kb
id: gameplay.impact.requirement
alias: Impact requirement
alias: personal contribution requirement
source: src/Server/app/engine/Impacts.js#@file
source: src/Server/app/engine/Scoring.js#@file
-->
## Personal requirement

The checkpoint requirement is personal, never a team total. It is the greater of a flat floor and the configured player share of the expected normal useful score pool across the band. One player's excess cannot satisfy another player's requirement.

<!-- kb
id: gameplay.impact.checkpoint-credit
alias: Impact checkpoint credit
source: src/Server/app/engine/Impacts.js#@file
adjacent: gameplay.scoring.exact-finish
-->
## Checkpoint credit

Exact-finish credit can reduce each player's remaining requirement only within the current band and is capped at remaining need. Credit that cannot be used in the active band is discarded rather than carried forward.

<!-- kb
id: gameplay.debug.tuning
alias: debug config
alias: live tuning
source: src/Server/app/Debug_Config.js#@file
source: src/Server/app/Game_Config.js#@file
adjacent: backend.lobby.debug-config
-->
## Debug tuning

The debug menu changes live server configuration and receives the clamped authoritative snapshot. It is a tuning surface, not a second rules engine. Client-only presentation controls remain local; synchronized cosmetic state that all players must see travels through the server.

The most coupled design surfaces are stability difficulty, personal Impact share, and site slenderness because geometry changes simultaneously alter reachability, support width, supply efficiency, and useful score pools.

<!-- kb
id: gameplay.debug.last-chance
alias: last chance power
source: src/Server/app/engine/Last_Chance.js#@file
adjacent: backend.engine.last-chance
-->
## Last Chance

Last Chance is debug-only. It rescues one otherwise collapsing placement into a pending one-percent state and requires the next placement to recover it. It is a controlled gameplay intervention rather than passive stability recalculation.

<!-- kb
id: gameplay.bots.scoring
alias: bot scoring
alias: bot placement policy
source: src/Server/app/Bot_Manager.js#@file
adjacent: backend.bots.preview
-->
## Bot scoring policy

Bots are QA/demo actors, not production authority. They evaluate brick and placement together through authoritative engine preview. Ranking by Height alone is invalid because it makes useful zero-height structural repairs unreachable.

<!-- kb
id: gameplay.bots.cooperative
alias: cooperative bots
alias: MVP greedy
source: src/Server/app/Bot_Manager.js#@file
-->
## Cooperative bot behavior

MVP-greedy behavior takes the best non-collapsing personal transaction. Cooperative behavior first stays near the best stability, then maximizes authoritative score. After satisfying its own Impact share it may prefer useful repair or wait so a short teammate can claim scarce Height. Zero-height repair is considered only while its support region remains in the normal active tower view.

<!-- kb
id: gameplay.bots.calibration
alias: bot collapse rate
alias: balance calibration
source: src/Server/app/Bot_Manager.js#@file
adjacent: testing.balance.tools
-->
## Bot calibration limit

Bot candidate selection rejects collapsing moves, so simulated bot collapse rate cannot calibrate human stability difficulty. Use stability distributions and Impact outcomes for automated balance evidence, and use human playtests for messy gap-filling behavior.
