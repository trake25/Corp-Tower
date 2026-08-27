# UI — Tutorial (Godot Client)

Scope: the client-side coach-mark tutorial layer. Screens & shell →
[ui.md](./ui.md). Gameplay HUD & stack → [ui-hud.md](./ui-hud.md). Gameplay
rules the tutorial teaches → [gameplay.md](./gameplay.md). File purposes and stable
anchors → grep [map/ui-tutorial.md](./map/ui-tutorial.md).

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

- `TutorialLessons.DEFAULTS` is the hand-maintained level-1 copy: target 30,
  grid 8, site columns 2–5, three active slots, 60 seconds, and the first
  Impact requirement of 90 at the 30% personal share. Resyncing is not a
  `DEFAULTS`-only edit: the lesson copy, exact-finish seed (28 + an `O` brick),
  and Impact-status seed all quote the same contract.
- `TutorialScene` stays scripted; it must not evaluate legality, stability, or
  scoring. Its structural demonstration passes authored `towerStructuralPose`
  records to `TowerStack`, and its Impact seed uses canonical
  `requiredContribution`/`bandContribution` fields rather than compatibility
  score aliases. The scripted support repair clears that pose to demonstrate a
  straighter section, not a client-side verdict.
- The placement lesson teaches a release row: a legal aimed row chooses where a
  brick begins falling, then gravity resolves first contact. A reachable gap can
  therefore be repaired; a tutorial must never claim that every void is
  unfillable from above.
- **`is_satisfied(info, …)` is always true by design.** The *controller*, not the
  predicate, must refuse to dispatch to an `info` step at all — otherwise any
  incidental action, a stray placement or an unrelated popover, silently skips it.
- **A step needing both the inventory row and the tower must spotlight
  `PlayField`, not a narrower control.** `TowerStack`/`TowerDropZone` exclude
  `ActionRow`, and popovers render as siblings outside their trigger's rect, so
  spotlighting either narrower target dims the exact input the step needs and
  silently blocks it. `PlayField` spans the screen, so its dim rects collapse to
  zero.
