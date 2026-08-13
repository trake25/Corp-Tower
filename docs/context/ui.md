# UI (Godot Client)

Scope: the Godot client's presentation layer — screen flow, the gameplay HUD, and
every leaf visual component. Wire protocol → [networking.md](./networking.md).
Tests → [testing.md](./testing.md#godot-client-tests). Per-symbol file and line →
grep [map/ui.md](./map/ui.md).

All paths under `src/Client/App/corp-tower/` unless noted. **The client renders
`game_state` and never computes a gameplay outcome.**

## Godot Client App (shell)

- `project.godot` autoloads NetworkManager as a singleton.
- Display: 412×917 portrait design size, `canvas_items` stretch. Aspect is
  `keep` on web and mobile (`.web`/`.mobile`), pillarboxed rather than
  widened — most `GameUI.tscn` children are fixed-offset, not edge-anchored.
- `Main.tscn` is the app root and owns [Screen Manager](#screen-manager). It swaps
  join / find-match / instanced [Game UI Scene](#game-ui-scene) — there is no
  static UI root scene.
- Android export config is the gitignored `export_presets.cfg`; CI uses a
  non-secret preset → [build.md](./build.md#android-deploy-wstodplay-workflow).
- Release target is **Android only**. Web/Windows/iOS are future.
- Two build-time flags from `EndpointConfig`, written per build by
  `write-endpoint-config.sh`: `DEBUG_UI_ENABLED` gates the debug button, off for
  the EKS web builds and the public demo; `DEMO_MODE_ENABLED` gates the required
  `DemoModeLabel` node disclosing that empty seats are bots, set only for
  `toddemo`.

There is **one** gameplay UI scene and no skin system.

The debug gate is UI-only. `update_config`/`resetDebugConfig` still have **no
server-side auth check** — full gating needs that before public release.

## Screen Manager

`Cor/Scripts/ScreenManager.gd`, on `Main.tscn`. Owns screen flow and the single
global floating debug button.

- Swaps sign-in / home / join / find-match / live Game UI Scene inside
  `ScreenContainer`, driven by the child screens' request signals and
  NetworkManager's `room_joined` / `room_closed`.
- Flow: Play Loader → Sign-in → Home → Join Screen; tutorial exit → Home,
  room-close → Join Screen. Demo skips both: Start Demo + Tutorial on
  Home, room-close → Home. Wired/stub buttons: [map/ui.md](./map/ui.md).
- No status bar is drawn — the OS supplies its own on mobile, web has none.
- Instantiates `PlayScreenScene` once per joined room and frees it on close.
- The debug button distinguishes tap from drag via
  `DEBUG_BUTTON_DRAG_THRESHOLD`. Visibility is set once in `_ready()` from
  `DEBUG_UI_ENABLED`; it is further *enabled* only when a live play instance
  exposes `toggle_debug_overlay()` and `NetworkManager.is_conn_estab` is true.
- Calls into Main by duck typing (`play_instance.call(...)`), so there is no
  static dependency on the Main UI Controller.
- `reset_debug_button_position()` runs on `_ready()` and room join, never after a
  manual drag — a player's drag persists until the next room join.

## Main UI Controller

`Cor/Scripts/Main.gd` — a slim orchestrator owning engine callbacks and
server-signal fan-out, delegating to single-purpose modules in
`Cor/Scripts/GameUi/`.

**Module family shape — follow it rather than adding logic back into `Main.gd`.**
Two shapes only:

- **Shared services** (`RefCounted`) — stateless or shared data, instantiable in
  GUT with no scene tree: `UiTuning`, `MatchState`, `PlayerContext`,
  `UiNodeBinder`, `PointerEvents`, `AccessibilitySettings`, `VisualHooks`,
  `PopoverCoordinator`, `BlockData`, `SnapGrid`.
- **View controllers** (`Node`, `add_child`-ed by Main so they share the scene
  lifecycle and can own `Tween`s/`Timer`s): `DebugPanelController`,
  `ScorePopupController`, `LevelSummaryController`, `RosterViewController`,
  `VisualHooksController`, `QuestController`, `QuickChatController`,
  `PowerController`, `InventoryController`, `TopBarController`.

Neither shape is added to `GameUI.tscn` directly. Each declares the nodes it needs
via its own `bind_nodes(binder)`, which Main aggregates through `UiNodeBinder`.

**Orchestrator surface:** constructs services in `_ready()` (code-created
children, never scene nodes); binds the node contract once and aborts via
`prepare_ui()` if a required node is missing; owns `_input` → `inventory`,
`_process` → `inventory.tick()` + `top_bar.tick_round_timer()`, `_unhandled_input`
→ close debug on `ui_cancel`; wires six NetworkManager signals in
`connect_network_signals()`; `update_game_state()` fans each `game_state` slice
out to its module. Exposes `missing_required_nodes` for the smoke test.

**Popover triggers wire their own signal.** Each trigger (`QuestChip`,
`QuickChatTrigger`, `PowerTrigger`) connects its native `.pressed` and calls
`should_block_popovers()` itself. There is no shared hit-test dispatcher — add new
triggers the same way.

### Module notes that are not derivable from the source

- `PointerEvents` owns the **input-kind latch**. Godot mirrors every touch into a
  matching mouse event (`emulate_mouse_from_touch`, default on) tagged
  `device == -1`, so `is_emulated(event)` is what separates a real mouse from a
  thumb. A hybrid device follows whichever input was used last.
- `AccessibilitySettings` holds room defaults overlaid by a **per-player** local
  override persisted to `user://accessibility.cfg`; a missing or corrupt file
  degrades to defaults. Per-player by design — one player can build by tap while
  the rest of the room drags.
- `VisualHooks` carries the Impact Beat durations. **They arrive only in
  `game_state.visualHooks`, and are not `debug_config` keys.**
- `BlockData.detect_orientation` replicates the server's rotate-and-mirror maths so
  one canonical brick PNG can be rotated *and* mirrored to match a randomly-dealt
  block; `brick_quad_points` mirrors via UV winding rather than a second asset.
  `brick_quad_colors` bakes top/bottom shading from each vertex's on-screen Y
  **after** rotation, so the highlight always reads as lit from above.
- `BlockData.emoji_anchor(cells)` is the centroid of occupied cells pulled onto the
  nearest occupied cell centre, **averaging all cells tied for nearest** — that tie
  rule is what keeps a symmetric `O`/`I`/`Z` face on its middle. A bounding-box
  centre does not work: for `L`/`T` it lands on empty space or a seam.
- `SnapGrid` works in **lattice coordinates** — x is a column *boundary* index, y a
  height in grid units above the platform. That is what makes a brick corner and a
  snap point directly comparable.
- `DebugPanelController` has three wiring shapes: most rows round-trip through
  `update_config`; the **Parallax** and **Placement** rows write straight onto live
  nodes with no server round-trip (purely cosmetic, client-local); the UI
  category's `ParallelPlacementButton` round-trips nothing and flips the local
  `AccessibilitySettings` override. The Tower category's mood threshold and the
  Hooks category's beat durations **do** round-trip despite being cosmetic — all
  three players must read the same faces and play the beat in lockstep.
- `ScorePopupController` lane x-positions span `0.16`–`0.84` of the layer width.
  They must stay wide enough to clear the popup's own 128px width, because
  `team_exact_bonus` fires one popup per player at the same y simultaneously.
- `InventoryController` **parallel placement** is the exclusive alternative to
  dragging: card tap selects, drop-zone tap arms the ghost locally, a second tap
  resolving to the *same* `(column, origin_y)` commits. Any other tap re-aims, so
  correcting an aim can never place by accident.

The `exact_finish`/`overbuild_finish` wire events arrive `displayOnly` and are
**dropped before a popup is built** — the Top Indicator already shows that state
live. Handle them only if you want a callout the indicator does not already give.

**Live-score correction.** Each rail player's total and Impact Bar fill add the
locally-tracked live `levelScore` **only while `is_playing()`** — total is
`score` + live, bar is `bandScore / requiredBandScore` + live. This avoids
double-counting a just-completed level during the finished/failed transition. The
bar snapping to 0% right after a level that closes an Impact band is expected: it
now tracks the next band's requirement.

**The round timer ticks locally every frame** off the deadline in the most recent
broadcast, in every state — that local tick is why it still counts down through
`starting`, where the server sends exactly one broadcast rather than a stream.

## Game UI Scene

`Cor/Scenes/GameUI.tscn`, themed by `Cor/Themes/GameUITheme.tres` — the single
scene hosting every HUD and debug node Main binds against. Instanced by Screen
Manager once a match is found; required at runtime.

`TeamInventoryPanel` is a **permanently visible** bar showing the shared draw pile,
not a popover. It reuses the `DrawPilePreview`/`DrawPileNameLabel`/
`DrawPileCountLabel` nodes verbatim, so `InventoryController` needs no logic for
it.

Node contract highlights: `TowerDropZone` (full-rect drag-release validator),
`DragPreview` (a hidden Block Preview shown while dragging *outside* the drop
zone), `DebugCategoryPanels/*` (one `ScrollContainer` per category, exactly one
visible), `LevelSummaryQuestLabel` and `ParallelPlacementButton` (both bound
`optional_node`, so a scene missing one degrades quietly). There is no
start-level popup — the freeze countdown is the top bar's own blinking round timer.

The three [Popover Panel](#popover-panel) instances each override their `Card` with
an explicit `custom_minimum_size` — `260x163` for Chat and Power, `260x140` for
Quest. **Card size is author-set, not content-derived**; change a popover's design
size there. The y-anchor is `trigger.y - 13 - card_height`, so cards of unequal
height do not share a bottom edge.

Debug categories are a **dropdown**, not a tab header — the category count grows
and a header does not scale with it.

## Popover Panel

`Cor/Scripts/PopoverPanel.gd`, scene `Cor/Scenes/PopoverPanel.tscn` — the reusable
anchored card (title, rule, row list) behind every tap-triggered popover.

- Auto-closes after `auto_close_seconds` (default 4s), on outside tap via the
  full-screen `OutsideCatcher`, or when the owner closes it. Never pauses
  gameplay underneath.
- Three instances: `ChatPopover`, `PowerPopover` (bottom-right, near their
  triggers), `QuestPopover` (top-left). Each controller computes its own card
  position from its trigger's live `get_global_rect()`.
- One popover open at a time. All three triggers **toggle**, checked against the
  popover's live `.visible` rather than last-known bookkeeping, since `close()` can
  fire asynchronously from the auto-close timer or an outside tap.
- Rows are single-line with `clip_text`, so long text cannot inflate a card.

`QuestController` auto-presents the Quest popover for the whole `state ==
"starting"` window, temporarily zeroing `auto_close_seconds` so it cannot
self-dismiss mid-freeze, and restoring it when the window ends.

## Leaf components

| Component | File | Role |
|---|---|---|
| Block Preview | `Cor/Scripts/BlockPreview.gd` | Rotated/mirrored textured quad at inventory or tower scale, plus the drag ghost's own snap-point rings |
| Tower Stack | `Cor/Scripts/TowerStack.gd` | The whole tower render: bricks, drag overlay, drop/tilt animation, mood faces, collapse sequence, Impact Beat |
| Collapse Sim | `Cor/Scripts/GameUi/CollapseSim.gd` | Node-free debris physics, seeded so every client renders it identically |
| Background Parallax | `Cor/Scripts/BackgroundParallax.gd` | Pans `BgArt` and `PlatformArt` against Tower Stack's scroll |
| Impact Bar | `Cor/Scripts/ImpactBar.gd` | Per-player Impact-progress fill |
| Cooldown Overlay | `Cor/Scripts/CooldownOverlay.gd` | Radial per-card cooldown |
| Debug Overlay | `Cor/Scripts/DebugOverlay.gd` | Show/hide shell only |
| Debug Tooltip | `Cor/Scripts/DebugTooltip.gd` | Dimmed modal explainer for debug rows |
| Player Colors | `Cor/Scripts/PlayerColors.gd` | `player_id` → colour |

### Tower Stack — the rendering contracts that matter

**The grid is server-owned.** `grid_width` and `placeable_column_min`/`_max` are
`static var`s on `SnapGrid`, fed from `game_state` on every broadcast, with the
render centre *derived* as `(grid_width − 1) / 2`. **Never alias them into `const`s**
— the server re-derives the grid every level, and a const alias renders the wrong
geometry with no error anywhere. The cost of `static` is that **tests must call
`reset_placeable_range()` in `before_each`** or inherit the previous grid.

**Fixed brick size plus a camera pan.** Bricks stay `brick_unit_size` always; the
view pans up with the HUD fixed. No scroll at all while the target height already
fits under the Top Indicator, none below `scroll_start_ratio` of visible capacity,
then a `pow(progress, scroll_ease_power)` ease toward the flush row, frozen once
target is reached so overbuild bricks ride up and tuck *under* the indicator.

Panning is a **scalar correction, not a camera.** The client is `Control`-based and
Tower Stack draws via raw `_draw()`, so there are no `Node2D` children for a
`Camera2D` to move; anything camera-shaped means re-architecting three scripts and
the drag hit-testing maths.

**Placement resolution is a 2-D pairing** in `SnapGrid`: for every outline vertex
of the dragged brick × every snap point on the platform and on every placed brick,
the candidate origin is `point − vertex`; candidates outside the site or
overlapping a placed cell are rejected and the smallest squared lattice distance
wins. That pairing fixes the **release row, not the resting row** — gravity then
runs from it, so a gap inside the tower is reachable while a brick aimed at
nothing still falls. Beyond `snap_radius_units` it falls back to nearest-column
aiming, so a drag over open sky never dead-ends. Support is **not** a legality
rule — gravity settles the brick instead, which is why the snap-point set stays
unfiltered.

The docked ghost renders at the **aim** (`aim_point`/`aim_origin_y`), not the
settled `origin_y`, so a legal target with nothing under it still visibly docks.
The highlighted snap dot stays on the *post-fall* contact, since the ghost's own
position already shows the aim.

**The Impact Beat** is a `ZOOM_OUT → WAVE → HOLD` phase machine. `HOLD` has **no
timed exit** — the camera stays pulled back until the level summary closes and
calls `cancel_impact_beat()`, then snaps straight to full zoom with no eased
zoom-in. The pull-back is a zoom and nothing else: `_unit_size()` returns
`brick_unit_size * _camera_zoom`, so every transform, the scroll ramp and the
visible capacity follow from that one value. The zoom is derived per level and
`impactBeatMinZoom` is a **floor, not the zoom** — a level whose tower already
fits yields `1.0` and plays the wave with no camera move.
It returns **false**, and the caller adds no wait, when the tower is empty, the
hook is off, or a collapse is in progress — **a collapse failure gets the shake
only, no beat**. Zoom is the whole mechanism: no separate scroll-bias term is
needed, because every scroll term already reads the zoomed unit.

**Brick faces are classified in the view, never on the server.** The entry carries
`balanceDelta` (lean-only) and the client compares it to the live
`towerStabilityMoodThreshold` at draw time, so moving the knob restyles the whole
standing tower. Faces lean and scroll with the tower but are **never rotated to
match the brick texture** — an upside-down smile reads as a frown. The one
exception is FALL/SETTLED debris, whose faces spin with their piece: a tumbling
pile reads as wreckage, not a live verdict.

## Landmines

- **Never run `godot --editor --quit`.** Its import/parse pass re-saves `.tscn`
  and drops authored overrides — `custom_minimum_size`, `stretch_mode`,
  `layout_mode` — silently. Edit scenes by hand or in the real editor. If it has
  run, `git checkout` the scene and re-apply.
- **A `.tscn` declares parents before children.** A row node must sit after its
  container in file order, or it draws a `Parent path … has vanished` warning and
  disappears. Moving a row between categories means moving its node block too.
- **`mouse_filter = 2` on every decorative or overlapping node.** Godot's default
  `0` (stop) makes a Control swallow touches even where it draws nothing.
- **`ScorePopupLayer` ships `visible = false`** and is re-enabled in
  `bind_nodes()` — Godot hides a hidden `CanvasItem`'s whole subtree, which would
  otherwise block every popup and bubble.
- **`window/handheld/orientation` must be the Godot 4 integer `1`.** A Godot
  3-style string silently coerces to `0` (landscape) with no warning, and the
  string form *looks* correct — check it first if orientation regresses.
- **Popovers ignore outside taps for `OUTSIDE_TAP_GRACE_MS` (250 ms) after
  `open()`**, and parallel-placement taps de-duplicate on a 60 ms window.
  Both exist because every physical tap yields a real event *and* an emulated
  partner, in either order. `DebugTooltip` mirrors the popover shape at 200 ms.
  `revalidate_armed_placement()` re-checks the armed spot on every broadcast and
  drops back to `SELECTED` when a teammate fills it.
- **`clear_snap_preview()` and `end_snap_drag()` are separate and must stay so.**
  The pointer legitimately leaves and re-enters the drop zone many times per drag,
  so a merged version wipes drag state on the first move.
- **Drag grip lift is stored in brick units (`drag_grip_offset_units`)** so it
  scales with `brick_unit_size`. It exists because a thumb-centred ghost covers
  the exact area being aimed at — Android is the first-class target.
- **`SnapGrid.settle_origin_y` / `is_placement_legal` are line-for-line mirrors of
  server `Tower_Stability.settleBlock` / `isPlacementLegal`.** Any change to either
  server function must be mirrored or the landing preview silently lies.
- **Draw calls under the tilt transform must subtract `pivot` first**, since the
  transform auto-offsets subsequent draws. The ghost is emitted inside that same
  block precisely so it inherits tilt, scroll and scale and cannot desync.
- **`local_to_grid` applies `_untilt`**, the inverse lean about the same pivot, or
  aiming at a point on a leaning tower resolves to the column it would have had
  upright — a real error at the live-play tilt cap.
- **`shake()` offsets only the local `base_x`/`baseline` inside `_draw()`**, never
  threaded through `_lattice_to_local`: `_build_collapse_seed` passes scroll `0`
  through that same function, and a shake term there corrupts the collapse seeds.
  Magnitude is measured against `brick_unit_size`, **not** `_unit_size()`, so the
  shake keeps its screen amplitude while the camera is pulled back.
- **The `balanceDelta` guard must sit *below* the verdict branch** in
  `_draw_block_emoji`. Above it, a brick from a server that sent no `balanceDelta`
  is silently skipped by the verdict wave and wears no face. A brick with no
  `balanceDelta` deliberately draws **no face** — a neutral face is
  indistinguishable from a real "barely moved" verdict and hides a stale server.
- **The platform is background, not HUD.** Tower Stack does not set
  `clip_contents`, and `_is_rect_visible()`'s bottom bound extends to the real
  screen bottom, so old bricks are hidden by later-drawn siblings rather than
  vanishing at the Control's own boundary.
- **`apply_camera_zoom()` must pivot `PlatformArt` on its top centre** before
  scaling, or the ground shrinks away from the bricks resting on it.
- **`PlatformArt` runs `parallax_ratio = 1.0` with `instant = true`**, snapping in
  the same frame as the brick redraw. It must stay aligned to the bricks, and no
  constant ratio can cancel an easing-induced lag — the residual gap grows with
  scroll distance. `BgArt` keeps eased motion; it has no alignment requirement.
- **Camera follow during a collapse is deliberately out of scope.** On a scrolled
  level the debris lands below the viewport, so Collapse Sim is invisible on most
  failures.
- **The revealed sky is a placeholder** — the solid `Background` panel stands in.
  A flat colour has no edge so it pans any distance; a real replacement must be
  **seamlessly vertically-tileable**, not merely a taller image.
- **Labels on a white card need an explicit dark `font_color` override.** The
  `CardMetaLabel` theme variation defines none and falls through to a near-white
  default, invisible on `WhiteCardPanel`.
- **`set_debug_label_text()` takes a `Control`, not a `Label`**, because some
  category name nodes are now flat `Button`s. Do not retype it back.
- **Node order in `GameUI.tscn` is deliberate.** `TopIndicatorRow` draws after
  `TowerStack`, so overbuild bricks tuck under the indicator instead of covering
  it. Ordering it before the tower makes the tower draw over the bar.
- **The editor cannot validate web layout.** `expand` and `keep` produce genuinely
  different viewport sizes and coincide only at 412×917 — which is exactly what the
  editor runs at. Popover mis-positioning and trigger-tap timing are likewise not
  reproducible in the editor. Verify on a deployed build.

## Tutorial

`Cor/Scripts/GameUi/Tutorial/` — a lesson-based coach-mark layer, entirely
client-side, rendered over the real Game UI Scene. Six modules following the
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
