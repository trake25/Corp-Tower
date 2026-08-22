# UI — Tutorial (Godot Client)

Scope: the client-side coach-mark tutorial layer. Screens & shell →
[ui.md](./ui.md). Gameplay HUD & stack → [ui-hud.md](./ui-hud.md). Gameplay
rules the tutorial teaches → [gameplay.md](./gameplay.md). Per-symbol file and
line → grep [map/ui-tutorial.md](./map/ui-tutorial.md).

All paths under `src/Client/App/corp-tower/` unless noted.

## Tutorial

`Cor/Scripts/GameUi/Tutorial/` — a lesson-based coach-mark layer, entirely
client-side, rendered through `Cor/Scenes/TutorialLayer.tscn` over the real Game
UI Scene. Six modules following the
module-family shape: `TutorialLessons` (the 12-lesson catalog plus `DEFAULTS`),
`TutorialGates` (the closed gate set and its pure predicate), `TutorialScene` (an
offline "fake server" that expands a lesson seed into the same calls live
`game_state` drives), `TutorialProgress` (`user://tutorial_progress.cfg`,
degrading to "nothing completed"), `TutorialController` (step lifecycle, spotlight
cutout, coach card), `TutorialMenuController` (the lesson list).

Entry points both funnel into `ScreenManager.start_tutorial(lesson_id)`: the Join
Screen's How to Play button and a debug row reachable from a live match. The
latter disconnects first, and Screen Manager guards `_on_room_closed()` while
`tutorial_active` so a race with a server-sent close cannot kill the run.

- **Drift — the tutorial's level-1 numbers no longer match the server curve.**
  `TutorialLessons` states target height 16 and Impact requirement 48 against the
  shipped curve's 30 / 90 ([gameplay.md](./gameplay.md)). Resyncing is not a
  `DEFAULTS` edit: lesson copy quotes both figures verbatim and the exact-finish
  lesson seeds a filler tower so the scripted brick lands on 16.
- **`is_satisfied(info, …)` is always true by design.** The *controller*, not the
  predicate, must refuse to dispatch to an `info` step at all — otherwise any
  incidental action, a stray placement or an unrelated popover, silently skips it.
- **A step needing both the inventory row and the tower must spotlight
  `PlayField`, not a narrower control.** `TowerStack`/`TowerDropZone` exclude
  `ActionRow`, and popovers render as siblings outside their trigger's rect, so
  spotlighting either narrower target dims the exact input the step needs and
  silently blocks it. `PlayField` spans the screen, so its dim rects collapse to
  zero.
