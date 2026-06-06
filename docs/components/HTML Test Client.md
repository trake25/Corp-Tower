# HTML Test Client

## Purpose
- Legacy browser-based local test harness.
- Files: `src/Client/index.html`, `src/Client/Client.js`.

## Responsibilities
- Basic WebSocket connection test.
- Basic block placement message test.
- Console visibility for early server/game logic.

## Key Logic
- Connect button opens WebSocket.
- Place button sends a test `place_block` message.
- Logs `room_created` and `game_state`.

## Inputs/Outputs
- Input: manual browser clicks.
- Output: WebSocket test messages and console logs.

## Dependencies
- [[Server Entry]]

## Notes
- Not the production client.
- Prefer [[Godot Client App]] for current work.
