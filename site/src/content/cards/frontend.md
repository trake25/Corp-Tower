---
role: "Frontend"
order: 5
tags: ["Frontend"]
plain: "The game's rules are kept completely separate from its graphics, so the part that has to be correct can be checked in seconds without opening the game."
---

**Decision.** Placement resolution, brick anchors, and the collapse simulation live in plain classes with no scene dependency. Scenes draw; helpers decide. The playable grid comes from the server, never hardcoded. GDScript, because I read it fluently.

**Instead of** putting the logic in the node that draws it — the natural Godot idiom, fewer files, everything already in scope. It loses because scene-mounted logic needs a mounted scene to exercise, making the highest-consequence code the hardest to verify. Hardcoding the grid loses separately: the play area scales with level, so a client constant is a desync waiting for a level.

**For** the player (a ghost never lands where the server scores differently) and the maintainer (change tuning, know in seconds whether placement still holds).

**Proof.** Nineteen scene-free tests pin that no resolved column ever lets a piece leave the play area, including when it widens mid-game. The brick-face key is asserted to match the server's field name, because a silent mismatch removes every face and nothing else would catch it. Stated boundary: a drag-state bug passed all of them and was caught only by rendering the field to an image — this design verifies the math, not what's drawn.
