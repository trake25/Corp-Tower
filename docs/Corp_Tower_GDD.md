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
- Calculate scores, save unused blocks into the next draw pile, then proceed to the next level.

## Players
- 3 players per match.
- Real-time interaction; placement order by who acts first.
- Players drag blocks from inventory cards onto the shared tower drop zone to place them.

## Reconnect and Shared Room Continuity
- Players receive a persistent server-issued player id and reconnect token.
- If a player disconnects and reconnects within the reconnect TTL (default 60 seconds, configurable via `RECONNECT_TTL_SECONDS`), the server resumes the same player slot in the same room.
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
- The pile is built from unused team carry-over blocks saved from completed levels plus generated high-level reserve blocks.
- Level 1 starts with an empty draw pile; levels 1-3 do not receive generated reserve blocks.
- Generated reserve blocks scale gradually by Impact band: level 4 starts with 1, level 7 with 2, level 10 with 3, and the pattern continues up to 32 generated draw blocks by level 97.
- Newly generated opening blocks fill active hand slots directly; they do not use the draw pile.
- The draw pile is shuffled before the level starts.
- On level completion, unused active hand blocks and any remaining draw pile blocks become the next team carry-over pool.
- Only up to 3 team carry-over blocks are kept.
- Carry-over prioritizes smaller precision blocks first.
- On level failure, team carry-over is discarded during Impact rollback.

## Power System
- Power unlocks at level 4 by default (`powerUnlockLevel`). Each player has up to 3 Power inventory slots (`powerMaxSlots`).
- Each eligible level has one shared side quest. Currently fixed to "first to make the exact-finishing placement" for every level (`setupSideQuest()` in [[Game Engine]]) — the block-size starter quest variant ("first to place a 4/5/6-cell block") is temporarily disabled; its completion check still exists in `tryCompleteSideQuest()` but is unreachable since no quest of that type is generated right now.
- Every player is guaranteed one Refresh item as soon as the room reaches `powerUnlockLevel`, re-granted at the start of any level (including restarts and Impact rollback) if they don't already hold one and have inventory space — no quest or luck required for the baseline.
- On top of that: the first eligible player to complete the level's side quest also receives a Power item if they have space (currently hardcoded to Refresh, since Score Cap/Copy Score aren't awarded by the quest path right now), and after a completed Impact, the player with the highest total score receives one Power item picked at random from the full catalog (Score Cap, Copy Score, or Refresh) if they have space.
- Unused Power items persist through subsequent levels in the same match, up to the slot cap. Items clear when the match closes.
- Power inventory is snapshotted at each completed Impact (including Impact MVP rewards). On rollback to the last Impact, any Power items earned after that snapshot are removed and each player's inventory is restored to the snapshotted state, preventing failed Impact-band attempts from farming items.
- `powerLifetime` controls rollback behavior: `impact` restores the snapshotted inventory on rollback; `match` keeps earned items across rollback (debug/legacy only).
- Players activate an item by tapping the Power icon to open a list of their held items, then tapping one — activation is instant, no target selection. Every activation affects **all players in the room** (caster included), not a single chosen target. Power activation has a 3-second cooldown (`powerActivationCooldownMs`) and cannot be used in the final 3 seconds of a level.
- Starter effects (all room-wide as of the tap-to-activate redesign):
  - **Score Cap (Offensive):** set every player's total score exactly to their own next Impact score requirement, whether their prior score was above or below it. Only obtainable via the Impact-MVP reward right now, not the side quest.
  - **Copy Score (Defensive):** set every player's total score to the caster's total score and update their Impact snapshot/baseline to the copied score. Only obtainable via the Impact-MVP reward right now, not the side quest.
  - **Refresh (Utility):** immediately reroll every player's hand. There is no token or use-count economy — activating the item is the entire effect, gated only by the shared Power activation cooldown.
- Every Power activation surfaces a toast naming the effect (e.g. "All players inventory refreshed" for Refresh). This toast is the sole activation feedback; the earlier legacy cue that recolored every player's score-rail entry to the caster color for 4 seconds has been removed.

### Refresh Effect Details
- Refresh is not a standalone player action anymore — it only happens when a player activates a held Refresh Power item, and it rerolls every player's hand at once, not just the caster's.
- Effect: replaces all of a player's current blocks using targeted rerolls.
- Blocks with size below 3 reroll into an unlocked size 3+ block when possible.
- Blocks with size 3 or higher keep their size but reroll shape/orientation.
- Refresh generation is aware of each player's own remaining height and tries to include at least one useful block for it.

## Tower System
- Target height uses a level-band curve, scaled by `targetHeightMultiplier` for debug tuning.
- Default curve: L1=3, L2=6, L3=8, L4-L12 ramps quickly, L13-L31 grows about 3 height every 4 levels, and L32+ grows about 1 height every 2 levels.
- Overbuilding allowed; excess height is wasted.
- Exact height triggers precision bonus rewards.
- The client renders placed blocks as a stacked tower from authoritative server history when `towerBlocks` is available.

### Tower Stability
- The shared tower uses a 7-cell authoritative structural grid. Fixed-orientation blocks fall to ground or first contact when placed.
- Gaps, overhangs, off-center supports, and overloaded support paths reduce deterministic stability from 100 to 0.
- Warning and critical wobble feedback occurs at tuned thresholds. Stability reaching 0 collapses the tower and fails the level before a target-height completion can count.

## Timer
- Default level time limit (Configurable): 30 seconds.
- Adjustable through server-side debug tuning (`levelTimeLimitMs`); public gameplay UI does not expose debug controls in the current design pass.

## Quick Chat
- Each player has three fixed quick-chat slots, currently: `Place Block!`, `Sorry!`, and `Hello!`.
- Messages are visible to all current room participants and have a server-authoritative per-player cooldown (default: 6 seconds) to prevent spam.
- Templates and cooldown are config-driven so future meme text/emoticons can replace the defaults without changing gameplay contracts.

## Failure Conditions
- Time runs out before target height is reached.
- All active hand blocks and the shared draw pile are exhausted before target is reached.
- Remaining possible height cannot reach target and no player holds a Refresh Power item that could still rescue the level.
- At Impact boundaries, any player whose score gained since the last Impact is below the band-relative Impact requirement fails the Impact and rolls back the team.

## Scoring System
| Component | Formula |
|---|---|
| Placement Score | `effective_height × level × placementScorePerHeight` (default `10`) |
| Finisher Bonus | `level × 4` |
| Precision Bonus | `level x 8` (exact finish only) |
| Team Bonus | `level x 6` (exact finish, all players) |
| Assist Bonus | Disabled by default (`assistBonusPerLevel = 0`) |
- MVP: player with highest level score for the level.
- Leaderboard score is snapshotted at each Impact and restored on rollback, preventing repeated failed Impact attempts from farming score.
- `impactMinContributionShare` sets the required per-player share of expected placement score for the Impact band; default is `30%`, and `0` disables the gate. `impactScoreRequirement` remains a hidden legacy flat floor when set by old tooling.

### Scoring Feedback UX
- Placement score shows as a `+points` popup in the placing player's color, using `placementScorePopupDurationMs`.
- Exact finish shows a distinct `PERFECT FIT` callout, followed by precision/team exact bonus feedback.
- Overbuild finish shows target reached with the wasted height amount and does not trigger exact-finish celebration.
- MVP is a display-only callout and does not award extra score; team total is not shown to players.
- Level summary appears after the end-of-level score popup batch has faded, showing result, team level score, MVP, finisher when present, per-player level score, final total score, contributed height, and bonus breakdown source data.
- Failed level summaries show level score but do not bank leaderboard score.

## Progression
- Target height increases each level.
- Block complexity increases with level: height-1 blocks at level 1, size-2 shapes at level 2, size-3 shapes at level 3, size-4 shapes at level 5, size-5 shapes at level 10, and size-6 shapes at level 15. Late unlocks include true vertical height-5 and height-6 line blocks.
- Inventory capacity increases with level: 1 active slot at level 1, 2 at level 2, and 3 at level 4.
- Impacts after every 3 levels.
- Failing a level rolls back to last completed Impact level.
- Opening hands are generated with solvability constraints so random supply should not make a level impossible before player decisions.

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
- Client debug controls live in a tabbed overlay and sync server state without echo loops.
- The debug header includes a Reset action that restores exposed tunables to the server's current `Game_Config.js` defaults.
- Tabs: Bots, Round, UI, Supply, Scoring, Tower, and Power.

### Currently Exposed Variables
| Variable | Description |
|---|---|
| `debugBotsEnabled` | Enables/disables debug bots globally. |
| `debugBotCount` | Bot slots allowed per room (0–2). |
| `debugBotStrategy` | Switches QA bots between cooperative height-management and MVP-greedy play. |
| `debugStartLevel` | Starts new rooms at a selected level and restarts active debug rooms at that level for tuning. |
| `debugBotDelayMin` | Min bot action delay (ms). |
| `debugBotDelayMax` | Max bot action delay (ms); never less than min. |
| `placementCooldown` | Anti-spam delay between placements (ms). |
| `levelTimeLimitMs` | Level timer duration (ms). |
| `startDelayMs` | Countdown before level becomes playable (ms). |
| `placementScorePopupDurationMs` | Placement score popup total lifetime, including fade-out (500-10000 ms, default 3000). |
| `finishScorePopupDurationMs` | MVP, Perfect Fit, and bonus popup total lifetime, including fade-out (500-10000 ms, default 3000). |
| `levelSummaryDelayMs` | Completed/failed level score summary visible duration before next level or rollback (1000-10000 ms, default 3000). |
| `impactMinContributionShare` | Required per-player share of expected placement score in the current Impact band; default `30%`, `0` disables the gate. |
| `targetHeightMultiplier` | Debug scale applied to the target-height curve; default 3 keeps the authored curve unchanged. |
| `levelSupplyMinSurplus` | Minimum generated total-height surplus above target. |
| `levelSupplyMaxSurplus` | Maximum generated total-height surplus above target. |
| `minPrecisionBlocksPerLevel` | Minimum count of height-1/2 precision blocks required in solvable supply. |
| `maxTeamCarryOverBlocks` | Max unused team blocks carried into the next completed level. |
| `refreshMinUsefulBlockHeight` | Minimum useful generated refresh height when remaining height allows it (used by the Refresh Power item's reroll). |
| `towerOverhangWeight` | Weight of a single unsupported cell in the just-placed block relative to a full column-width of center-of-mass drift. |
| `towerMaxTiltAngleDeg` | Visual lean cap in degrees, reached when tilt score hits ±1.0. |
| `towerCollapseTiltScore` | The tilt-score magnitude at or above which the tower collapses. |
| `towerStabilityWarningThreshold` | Stability percentage (0-100) at or below which a wobble warning fires. |
| `towerStabilityCriticalThreshold` | Stability percentage (0-100) at or below which a critical warning fires; clamped to never exceed the warning threshold. |
| `powerUnlockLevel` | Level at which the Power system (side quests, items) unlocks. |
| `powerMaxSlots` | Per-player Power inventory slot cap. |
| `powerActivationCooldownMs` | Cooldown between a player's Power activations. |
| `placementScorePerHeight` | Placement score scale applied to effective height and level. |
| `finisherBonusPerLevel` | Finisher score multiplier per level. |
| `precisionBonusPerLevel` | Exact-finish finisher score multiplier per level. |
| `teamExactBonusPerLevel` | Exact-finish team score multiplier per level. |
| `assistBonusPerLevel` | Assist score multiplier per level; `0` disables assist scoring. |
| `assistContributionThreshold` | Minimum contribution share required for assist bonus when assist scoring is enabled. |

### Validation Rules
- Unknown keys rejected.
- Numeric values clamped to safe ranges.
- `debugBotDelayMax` ≥ `debugBotDelayMin` enforced.
- `resetDebugConfig` restores the server-side defaults captured from `Game_Config.js` at process startup, then rebroadcasts `debug_config`.
- Debug settings are runtime tuning only, not player progression data.

### Bot Behavior Requirements
- Bots are QA/local test helpers only.
- Bot loops are level-scoped; delayed actions from previous levels cannot fire in next level.
- Bot actions stop when `debugBotsEnabled` is false.
- Bots only fill rooms when at least one real player is waiting.
- Cooperative bots prefer exact finishing blocks, avoid overbuilding near the target, and otherwise play the highest useful block. Bots never hold or activate Power items, so they always place — they have no refresh behavior.
- MVP-greedy bots prefer the highest effective score contribution, still taking exact finishes when available.

### Future Debug Variables (Planned)
- `blockWeights`, `blockUnlockLevels`, `inventoryScaling`, `impactInterval`, target-height curve bands, and per-shape generation pools.
- Shape-block recalibration candidates: per-level shape pools, guaranteed minimum available height, target curve by level band, and fail-condition pressure.

### Shipping Requirement
- Debug Menu must be disabled behind a build flag, QA account permission, or server-side admin authorization before public release.

## MVP Scope
- 3-player matchmaking, shape block assignment, draw pile, tower building logic, scoring system, and basic UI.

## GDD Maintenance Policy
- GDD is the source of truth for game design decisions.
- Update this file whenever: game rules, scoring, balance variables, player-facing mechanics, debug tuning controls, bot gameplay behavior, progression, rewards, or failure conditions change.
- Technical-only changes (CI/CD, deployment, dependency updates) go in [[Corp_Tower_TDD]] instead.
