---
role: "Backend"
order: 4
headline: "The server decides everything; the phone only draws the result."
plain: "That's what lets someone lose signal on the bus, come back, and still be in the same game — served by a different worker than the one that started it."
metric: "Any pod"
metricLabel: "recovers any room"
tools:
  - "Node.js"
  - "Redis"
  - "WebSocket (ws)"
  - "Kubernetes"
links:
  - label: "Lobby_Manager.js — matchmaking & rooms"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Server/app/Lobby_Manager.js"
  - label: "Tower_Stability.js — pure scoring"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Server/app/Tower_Stability.js"
  - label: "Redis_State.js — shared state"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Server/app/Redis_State.js"
  - label: "backend.md"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/backend.md"
---

### Decision

Server-authoritative, with room state in Redis so any worker can serve any player and any pod can recover a room it didn't create. Node.js, because I read it fluently.

### Instead of

**Host-authoritative** — cheaper, common in small multiplayer, and it loses twice here. The host's disconnect ends everyone's game, on a title played by three people on mobile. And the design is a scoreboard with selfish-cooperation tension, so client-computed scoring makes the whole design decorative. Also rejected: sticky sessions pinning a room to one pod, which turns any restart into a lost room.

### Why it matters

Reconnect inside the TTL resumes the same slot in the same room, rebuilt by whichever worker answers. The player never learns which pod they were on, which is the point.

### Proof

- Room formation is serialized by a Redis lock while enqueueing is deliberately left unlocked — that's the actual race window, and locking it would cost throughput for nothing.
- Players whose room was formed by another pod are handed to the pod holding their live socket.
- Stability is a pure function, so the engine, the bots, and the offline balance simulator grade a tower with identical math.
