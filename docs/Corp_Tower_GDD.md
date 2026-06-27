# Corp Tower GDD
> ⚠️ Verify against current implementation before trusting balancing values and scoring formulas.

## Core Concept
- 3-player real-time cooperative puzzle game.
- Players build a shared tower using randomly assigned blocks.
- Compete for MVP score while ensuring the team reaches target height.

## Core Game Loop
- Queue 3 players into a room.
- Assign blocks and start level with configurable delay (Default: 2s).
- Players place blocks in real time; order determined by input timing.
- Placing a block refills that player's hand from the shared draw pile when one is available.
- Configurable anti-spam cooldown per player after placement (Default: 2s).
- Level ends when target height is reached or a failure condition triggers.
- Calculate scores, carry over blocks, then proceed to next level.

## Players
- 3 players per match.
- Real-time interaction; placement order by who acts first.

## Reconnect and Shared Room Continuity
- Players receive a persistent server-issued player id and reconnect token.
- If a player disconnects and reconnects within 10 seconds during staging/debug testing, the server resumes the same player slot in the same room.
- The client must be able to display/retain the current room id after room creation or resume.
- Routing is transparent to players: the learning gateway should usually route a WebSocket to one worker server, but any healthy worker can recover the room/player session from shared Redis state.
- Redis is the authoritative shared state layer for active matchmaking, room/session lookup, reconnect identity, and room ownership across horizontally scaled server workers.
- If reconnect TTL expires while the room has no connected real players, the room is destroyed instead of continuing with bots.

## Block System
- Blocks assigned at level start; shapes are random like tetris and cannot be rotated.
- A block's height contribution is its fixed vertical footprint, not its cell count.
- Example: a 3-cell vertical block contributes 3 height, a 3-cell horizontal block contributes 1 height, and a 3-cell L block contributes 2 height.
- The server assigns each block's shape/orientation and sends `{ id, shapeId, cells, height }` to the client.
- Shape IDs use compact orientation names such as `I4H` for a 4-cell horizontal line and `I4V` for a 4-cell vertical line.

### Inventory Rules
- Max 3 active blocks per player.
- Active inventory slots unlock by progression: 1 slot at level 1, 2 slots at level 2, and 3 slots at level 4.
- The previous 4th carry-over inventory slot is removed.
- Empty hand slots are refilled from the shared draw pile after placement while the pile has blocks.
- The next shared draw block is visible to all players; whichever player places next receives it.

### Draw Pile And Team Carry-Over System
- Each level creates a server-owned shared draw pile.
- The pile is built from team carry-over blocks plus newly generated level blocks.
- The pile is shuffled before opening hands are dealt.
- The generator keeps a level-scaled reserve after opening hands are dealt: 3 draw blocks at level 1, 4 at level 2, and 6 from level 4 onward.
- On level completion, unused active hand blocks from all players become the team carry-over pool.
- Only up to 3 team carry-over blocks are kept.
- Carry-over prioritizes smaller precision blocks first.
- Hidden blocks left in the draw pile do not carry over.
- On level failure, team carry-over is discarded during checkpoint rollback.

## Refresh Token System
- Max 1 token per player `(1/1)` — per-player UI and variable.
- Max 2 uses per level `(2/2)` — global UI and variable.
- Effect: replaces all current blocks.
- Cannot be used in the last 10 seconds of a level.
- Only refreshes current remaining inventory.

### Token Rewards
- MVP of previous level receives 1 token.
- Exact target height finish: all players receive 1 token (capped at 1).

## Tower System
- Target height uses a level-band curve, scaled by `targetHeightMultiplier` for debug tuning.
- Default curve: L1=3, L2=6, L3=8, L4-L6 +3 per level, L7-L12 +4 per level, L13+ +5 per level.
- Overbuilding allowed; excess height is wasted.
- Exact height triggers precision bonus rewards.
- The client renders placed blocks as a stacked tower from authoritative server history when `towerBlocks` is available.

## Timer
- Default level time limit (Configurable): 30 seconds.
- Adjustable through server-side debug tuning (`levelTimeLimitMs`); public gameplay UI does not expose debug controls in the current design pass.

## Failure Conditions
- Time runs out before target height is reached.
- All active hand blocks and the shared draw pile are exhausted before target is reached.
- Remaining possible height cannot reach target and no refresh can still rescue the level.
- Checkpoint every 3 levels - minimum each player leaderboard score requirement not reached.

## Scoring System
| Component | Formula |
|---|---|
| Placement Score | `effective_height × level` |
| Finisher Bonus | `level × 4` |
| Precision Bonus | `level × 6` (exact finish only) |
| Team Bonus | `level × 4` (exact finish, all players) |
| Assist Bonus | `level × 6` (if player contributes ≥ 25% of total height) |
- MVP: player with highest level score for the level.

## Progression
- Target height increases each level.
- Block complexity increases with level: height-1 blocks at level 1, size-2 shapes at level 2, size-3 shapes at level 3, size-4 shapes at level 5, size-5 shapes at level 10, and size-6 shapes at level 15.
- Inventory capacity increases with level: 1 active slot at level 1, 2 at level 2, and 3 at level 4.
- Checkpoints after every 3 levels.
- Failing a level rolls back to last completed checkpoint level.
- Level draw piles are generated with solvability constraints so random supply should not make a level impossible before player decisions.

## Leaderboard
- Highest level reached.
- MVP scores.
- Optional stats: finisher count, exact finish rate.

## Design Pillars
- Simplicity: no rotation, limited inventory.
- Tension: real-time placement, timer pressure.
- Fairness: no pay-to-win mechanics.
- Replayability: random blocks, skill-based progression.

## Debug Menu and Live Tuning
- Purpose: expose selected [[Game Config]] variables to designers/QA without code changes or restarts.
- Authority: server validates and applies all changes; broadcasts `debug_config` to all real clients.
- Client debug controls are not part of the current gameplay UI design pass; future debug UI must sync without echo loops.

### Currently Exposed Variables
| Variable | Description |
|---|---|
| `debugBotsEnabled` | Enables/disables debug bots globally. |
| `debugBotCount` | Bot slots allowed per room (0–2). |
| `debugBotDelayMin` | Min bot action delay (ms). |
| `debugBotDelayMax` | Max bot action delay (ms); never less than min. |
| `placementCooldown` | Anti-spam delay between placements (ms). |
| `levelTimeLimitMs` | Level timer duration (ms). |
| `startDelayMs` | Countdown before level becomes playable (ms). |
| `targetHeightMultiplier` | Debug scale applied to the target-height curve; default 3 keeps the authored curve unchanged. |

### Validation Rules
- Unknown keys rejected.
- Numeric values clamped to safe ranges.
- `debugBotDelayMax` ≥ `debugBotDelayMin` enforced.
- Debug settings are runtime tuning only, not player progression data.

### Bot Behavior Requirements
- Bots are QA/local test helpers only.
- Bot loops are level-scoped; delayed actions from previous levels cannot fire in next level.
- Bot actions stop when `debugBotsEnabled` is false.
- Bots only fill rooms when at least one real player is waiting.
- Bots prefer exact finishing blocks, avoid overbuilding near the target, otherwise play the highest useful block, and may refresh when no useful block is available.

### Future Debug Variables (Planned)
- `blockWeights`, `blockUnlockLevels`, `inventoryScaling`, `maxRefreshTokens`, `maxRefreshUsesPerLevel`, `refreshLockoutMs`, `checkpointInterval`, scoring bonus multipliers, target-height curve bands, draw-pile supply constraints, and max team carry-over blocks.
- Shape-block recalibration candidates: per-level shape pools, guaranteed minimum available height, target curve by level band, refresh rewards, and fail-condition pressure.

### Shipping Requirement
- Debug Menu must be disabled behind a build flag, QA account permission, or server-side admin authorization before public release.

## MVP Scope
- 3-player matchmaking, shape block assignment, draw pile, tower building logic, scoring system, and basic UI.

## GDD Maintenance Policy
- GDD is the source of truth for game design decisions.
- Update this file whenever: game rules, scoring, balance variables, player-facing mechanics, debug tuning controls, bot gameplay behavior, progression, rewards, or failure conditions change.
- Technical-only changes (CI/CD, deployment, dependency updates) go in [[Corp_Tower_TDD]] instead.
