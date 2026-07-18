# Scoring

## Purpose
Score events, placement/bonus scoring, leaderboard banking, MVP, and level
summaries for one room. File: `src/Server/app/engine/Scoring.js`. Every
export is a plain function taking the owning [[Game Engine]] instance as its
first argument; `GameEngine` re-exposes each one as a same-named method.

## Responsibilities
- Create and queue transient score events; hand off the pending queue for
  broadcast each tick.
- Award placement score (height × level × configured rate) and record it in
  a player's per-level breakdown.
- Award completion bonuses: finisher, precision (exact finish), team-exact,
  and assist (contribution-share threshold) — all level-scaled multipliers
  from [[Game Config]].
- Bank a level's accumulated `levelScore` into the player's persistent
  `score` once the level resolves.
- Compute the level MVP.
- Build the full level-summary payload (result, reason, per-player
  breakdown, MVP, Impact status) sent to clients.

## Public interface
Grouped by area:
- **Score events** — `createScoreEvent(type, options)`,
  `queueScoreEvent(type, options)`, `consumeScoreEvents()`.
- **Placement/bonus** — `recordScoreBreakdown(player, key, points)`,
  `addPlacementScore(player, block, effectiveHeight)`,
  `awardCompletionBonuses(finisher, exactFinish)`,
  `addBonusScore(player, points, label)`, `getBonusScoreEventType(label)`,
  `getBonusScoreEventLabel(label)`.
- **Leaderboard** — `addLevelScoreToLeaderboard()`.
- **Summary/MVP** — `getPlayerScoreMap()`, `getTeamLevelScore()`,
  `getPlayerBonusBreakdown(player)`, `buildLevelSummary(options)`,
  `getLevelMVP()`.

## Depends on
- Internal: [[Game Config]] (direct `require`); [[Block Supply]] via the
  engine facade (`addPlacementScore` reads `engine.getBlockHeight(block)` for
  its event `meta`).
- External: none.

## Notes
- Called from [[Game Engine]]'s `placeBlock()` (`addPlacementScore`),
  `completeLevel()`/`failLevel()` (`queueScoreEvent`,
  `awardCompletionBonuses`, `addLevelScoreToLeaderboard`, `buildLevelSummary`,
  `getLevelMVP`), and from [[Impacts]]'s `failImpactScoreRequirement()`
  (`queueScoreEvent`, `buildLevelSummary`, `getLevelMVP`,
  `getPlayerScoreMap`).
- **Score banking is two-stage**: placement/bonus points accumulate in
  `player.levelScore` during a level; only `addLevelScoreToLeaderboard()`
  moves that into `player.score`. This is why a failed level's score doesn't
  count toward the final total — see `Score_Events.test.js`'s "failed level
  summary does not bank level score into final totals".
- Bonuses (finisher, precision, team, optional assist) use multipliers from
  [[Game Config]]; disabled (zero-value) bonuses don't emit score events.
- `scoreEvents[]` built here are transient, broadcast-only, and never
  persisted in room snapshots — clients shouldn't infer scoring UI from
  aggregate score diffs alone (the same rule applies to `quickChatEvents[]`
  and `powerEvents[]`, which [[Game Engine]] still queues directly).
- `awardRefreshToken` used to live here (called from `completeLevel()` to
  grant MVP/exact-finish token rewards). It's gone along with the refresh
  token economy — see [[Game Engine]]'s Notes for what replaced it.
