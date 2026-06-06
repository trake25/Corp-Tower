# Bot Manager

## Purpose
- QA/testing bot action scheduler.
- File: `src/Server/Bot_Manager.js`.

## Responsibilities
- Start bot loops for bot participants.
- Pick randomized action delay from [[Game Config]].
- Place bot blocks through [[Game Engine]].
- Stop bot timers when rooms close or bots are disabled.

## Key Logic
- `startBots(engine)`:
  - Stops existing bot timers first.
  - Starts one loop per bot in the room.
- `runBotLoop(bot, engine, level)`:
  - Schedules `setTimeout`.
  - Validates room, debug flag, room state, level, and inventory before acting.
  - Repeats while valid.
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
