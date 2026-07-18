# Bot Manager

## Purpose
QA/testing bot action scheduler. File: `src/Server/app/Bot_Manager.js`.

## Responsibilities
- Start and stop bot action loops for bot participants in a room.
- Pick a randomized action delay from [[Game Config]].
- Choose a placement action per a debug-selectable bot strategy.
- Place bot shape blocks through [[Game Engine]], by inventory index — the
  same authoritative path real players use.
- Stop bot timers when rooms close or bots are disabled.

## Public interface
- `startBots(engine)` — stops any existing bot timers, then starts one loop
  per bot in the room.
- `stopBots(engine)` — stops all bot timers for bots currently in
  `engine.room`; the actual method [[Game Engine]] calls (on room
  close/restart/stop). Internally calls `stopBot(bot)` per bot.
- Internally: `stopBot(bot)` (per-bot timer/tracking cleanup), `runBotLoop`
  (schedules and re-validates on each tick), and `chooseBotAction` (strategy
  dispatch) are not called from outside this file.

## Depends on
- Internal: [[Game Config]], [[Game Engine]]
- External: none

## Notes
- Bots are not production AI — they exist for testing rooms without three
  human players.
- Cooperative strategy: plays an exact-finishing block when available, near
  the target plays the smallest block that doesn't overbuild, otherwise plays
  the highest useful block.
- MVP-greedy strategy: plays an exact-finishing block when available,
  otherwise the block with the highest effective height contribution, even if
  that overbuilds.
- Timer tracking (`bot.botTimer`, `botLoopLevel`) exists specifically so a
  disconnected/closed room's bots don't keep running in the background.
- Bots never hold or activate Power items and always dispatch to `placeBlock`
  — there is no bot refresh behavior. `canBotRefresh` and the
  low-inventory-height refresh branches in both strategies were removed
  along with the refresh token economy (see [[Game Engine]]'s Notes).
