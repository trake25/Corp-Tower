# Bot Manager

## Purpose
- QA/testing bot action scheduler.
- File: `src/Server/Bot_Manager.js`.

## Responsibilities
- Start bot loops for bot participants.
- Pick randomized action delay from [[Game Config]].
- Select a simple height-management action.
- Place bot shape blocks through [[Game Engine]] by inventory index.
- Use refresh through [[Game Engine]] when the bot has no useful non-overbuilding block.
- Stop bot timers when rooms close or bots are disabled.

## Key Logic
- `startBots(engine)`:
  - Stops existing bot timers first.
  - Starts one loop per bot in the room.
- `runBotLoop(bot, engine, level)`:
  - Schedules `setTimeout`.
  - Validates room, debug flag, room state, level, and inventory before acting.
  - Repeats while valid.
- `chooseBotAction(bot, engine)`:
  - Plays an exact-finishing block when available.
  - Near the target, plays the smallest block that does not overbuild.
  - Otherwise, plays the highest useful block.
  - Refreshes if possible when every current block would overbuild.
- `stopBot(bot)`:
  - Clears pending timeout stored in `bot.botTimer`.
  - Clears `botLoopLevel`.

## Inputs/Outputs
- Input: room bots and timing values.
- Output: bot `placeBlock` calls.

## Dependencies
- [[Game Config]]
- [[Game Engine]]

## Notes
- Bots are not production AI.
- Timer tracking exists to prevent disconnected rooms from continuing in the background.
- Bot placements use the same authoritative shape-height and tower-history path as real players.
