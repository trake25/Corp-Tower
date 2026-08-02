---
role: "Frontend"
order: 5
headline: "Rules out of the renderer, so the part that has to be correct is testable in seconds."
plain: "The game's logic is kept completely separate from its graphics. Placement, anchors and the collapse simulation can be checked without ever opening the game."
metric: "19"
metricLabel: "scene-free tests"
tools:
  - "Godot"
  - "GDScript"
  - "GUT (Godot tests)"
links:
  - label: "SnapGrid.gd — placement math"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Client/App/corp-tower/Cor/Scripts/GameUi/SnapGrid.gd"
  - label: "CollapseSim.gd — deterministic physics"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Client/App/corp-tower/Cor/Scripts/GameUi/CollapseSim.gd"
  - label: "test_snap_grid.gd"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Client/App/corp-tower/Tests/Gut/GameUi/test_snap_grid.gd"
  - label: "ui.md"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/ui.md"
---

### Decision

Placement resolution, brick anchors, and the collapse simulation live in plain classes with no scene dependency. Scenes draw; helpers decide. The playable grid comes from the server, never hardcoded. GDScript, because I read it fluently.

### Instead of

**Putting the logic in the node that draws it** — the natural Godot idiom, fewer files, everything already in scope. It loses because scene-mounted logic needs a mounted scene to exercise, which makes the highest-consequence code the hardest to verify. Hardcoding the grid loses separately: the play area scales with level, so a client constant is a desync waiting for a level.

### Why it matters

For the player, a ghost never lands where the server scores differently. For the maintainer, change the tuning and know in seconds whether placement still holds.

### Proof

- Nineteen scene-free tests pin that no resolved column ever lets a piece leave the play area, including when it widens mid-game.
- The brick-face key is asserted to match the server's field name, because a silent mismatch removes every face and nothing else would catch it.
- **Stated boundary:** a drag-state bug passed all of them and was caught only by rendering the field to an image. This design verifies the math, not what's drawn — and saying so is part of knowing what the tests are worth.
