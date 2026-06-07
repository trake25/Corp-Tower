# Corp Tower GDD
> ⚠️ Verify against current implementation before trusting balancing values and scoring formulas.

## Core Concept
- 3-player real-time cooperative puzzle game.
- Players build a shared tower using randomly assigned blocks.
- Compete for MVP score while ensuring the team reaches target height.

## Core Game Loop
- Queue 3 players into a room.
- Assign blocks and start level with a 3-second delay.
- Players place blocks in real time; order determined by input timing.
- 3-second anti-spam cooldown per player after placement.
- Level ends when target height is reached or a failure condition triggers.
- Calculate scores, carry over blocks, then proceed to next level.

## Players
- 3 players per match.
- Real-time interaction; placement order by who acts first.

## Block System
- Blocks assigned at level start; shapes are random and cannot be rotated.

### Inventory Rules
- Max 3 active blocks + 1 carry-over block from previous level.
- If limit exceeded: least-height or newest block is destroyed.

### Carry-Over System
- Only 1 unused block carries to next level.
- Best available height block is retained.

## Refresh Token System
- Max 1 token per player `(1/1)` — per-player UI and variable.
- Max 2 uses per level `(2/2)` — global UI and variable.
- Effect: replaces all current blocks.
- Cannot be used in the last 10 seconds of a level.
- Calibration note: currently can refresh after placing a block but only refreshes current inventory.

### Token Rewards
- MVP of previous level receives 1 token.
- Exact target height finish: all players receive 1 token (capped at 1).

## Tower System
- `target_height = 3 × level` (multiplier tunable via `targetHeightMultiplier`).
- Overbuilding allowed; excess height is wasted.
- Exact height triggers precision bonus rewards.

## Timer
- Default level time limit: 30 seconds.
- Adjustable via Debug Menu (`levelTimeLimitMs`).

## Failure Conditions
- Time runs out before target height is reached.
- All blocks used and target not reached.
- Checkpoint failure every 3 levels (minimum score requirement).
- ~~Early failure if remaining possible height < required target~~ (deprecated).

## Scoring System
| Component | Formula |
|---|---|
| Placement Score | `block_height × level_multiplier × efficiency` |
| Efficiency Bonus | `effective_height / block_height` |
| Finisher Bonus | `level × 10` |
| Precision Bonus | `level × 10` (exact finish only) |
| Team Bonus | `level × 5` (exact finish, all players) |
| Assist Bonus | `level × 6` (if player contributes ≥ 25% of total height) |
- MVP: player with highest level score for the level.

## Progression
- Target height increases each level.
- Block complexity increases with level.
- Checkpoints every 3 levels.
- Failing a level rolls back to last completed checkpoint.

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
- Clients use `set_pressed_no_signal` / `set_value_no_signal` on sync to avoid echo loops.

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
| `targetHeightMultiplier` | Multiplier for `target_height = level × multiplier`. |

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

### Future Debug Variables (Planned)
- `blockWeights`, `blockUnlockLevels`, `inventoryScaling`, `maxRefreshTokens`, `maxRefreshUsesPerLevel`, `refreshLockoutMs`, `checkpointInterval`, scoring bonus multipliers.

### Shipping Requirement
- Debug Menu must be hidden behind a build flag, QA account permission, or server-side admin authorization before public release.

## MVP Scope
- 3-player matchmaking, block assignment, tower building logic, scoring system, basic UI.

## GDD Maintenance Policy
- GDD is the source of truth for game design decisions.
- Update this file whenever: game rules, scoring, balance variables, player-facing mechanics, debug tuning controls, bot gameplay behavior, progression, rewards, or failure conditions change.
- Technical-only changes (CI/CD, deployment, dependency updates) go in [[Corp_Tower_TDD]] instead.
