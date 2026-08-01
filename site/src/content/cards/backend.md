---
role: "Backend"
order: 4
tags: ["Backend"]
plain: "The server decides everything; players' phones only draw the result. That's what lets someone lose signal on the bus, come back, and still be in the same game."
---

**Decision.** Server-authoritative, with room state in Redis so any worker can serve any player and any pod can recover a room it didn't create. Node.js, because I read it fluently.

**Instead of** host-authoritative — cheaper, common in small multiplayer, and it loses twice here: the host's disconnect ends everyone's game on a title played by three people on mobile, and the design is a scoreboard with selfish-cooperation tension, so client-computed scoring makes the whole design decorative. Also rejected: sticky sessions pinning a room to one pod, which turns any restart into a lost room.

**For** the player. Reconnect inside the TTL resumes the same slot in the same room, rebuilt by whichever worker answers.

**Proof.** Room formation is serialized by a Redis lock while enqueueing is deliberately left unlocked — that's the actual race window, and locking it would cost throughput for nothing. Players whose room was formed by another pod are handed to the pod holding their live socket. Stability is a pure function, so the engine, the bots, and the offline simulator grade a tower with identical math.
