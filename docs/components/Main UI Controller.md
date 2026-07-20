# Main UI Controller

## Purpose
Godot controller for the main game screen. File:
`src/Client/App/corp-tower/Cor/Scripts/Main.gd`. Once a single ~2,700-line
script, it is now a slim (~415-line) orchestrator that owns the engine
callbacks and the server-signal fan-out, and delegates every responsibility to
single-purpose modules under `Cor/Scripts/GameUi/`.

## Responsibilities (orchestrator)
- Construct the shared services and controllers in `_ready()` (as code-created
  children, never scene nodes), bind the [[Game UI Scene]] node contract once
  through `UiNodeBinder`, and abort via `prepare_ui()` if any required node is
  missing.
- Own the Godot input/frame callbacks: `_input()` → `inventory.handle_input()`
  only (each popover trigger connects its own native `.pressed` signal instead
  of being hit-tested here — see Notes); `_process()` → `inventory.tick()`,
  `top_bar.tick_round_timer()`; `_unhandled_input()` → close the debug overlay
  on `ui_cancel`.
- Wire the six [[NetworkManager]] signals in `connect_network_signals()` and
  host `update_game_state()` as the explicit fan-out that pushes each slice of a
  `game_state` payload into the matching module.
- Keep the small surface other components call directly: `toggle_debug_overlay()`
  (duck-typed from [[Screen Manager]]), `on_connect_pressed()`,
  `open_team_inventory_popover()` / `position_team_inventory_popover_card()`,
  `should_block_popovers()` (the shared debug-panel/level-summary guard passed
  into each controller's `setup()`), and the connection/room/status handlers
  (`update_status`, `update_connect_button`, `update_room`, `update_room_closed`).
- Expose `missing_required_nodes` (read by [[Godot Client Tests]]' smoke test)
  and the module handles (`inventory`, `power`, `roster`, `score_popups`,
  `summary`, `quest`, `chat`, `top_bar`, `debug_panel`, `popovers`, `players_ctx`,
  `match_state`, `tuning`) for tests and cross-module wiring.

## Module family (`Cor/Scripts/GameUi/`)
Two shapes: pure state/logic units extend `RefCounted` (instantiable in GUT with
no scene tree); view controllers extend `Node` and are `add_child`-ed by Main so
they share the scene's lifecycle (freed with the [[Game UI Scene]] instance) and
can own `Tween`s/`Timer`s. None are added to `GameUI.tscn`; each declares the
nodes it needs in a `bind_nodes(binder)` method that Main aggregates.

Shared services (RefCounted, injected everywhere):
- `UiTuning` — the four client-tuning values (`placement_cooldown_ms`, placement/
  finish popup durations, `level_summary_delay_ms`) written from both
  `debug_config` and `game_state`.
- `MatchState` — `current_match_state`, `current_level`, `impact_interval`,
  `is_playing()`.
- `PlayerContext` — roster/color-map/seat-index and the color + display-name +
  `is_local` helpers (consolidates the scattered `NetworkManager.player_id`
  "is local" checks and [[Player Colors]] lookups).
- `UiNodeBinder` — wraps the `find_child` node-contract binding and collects
  missing required names.
- `PointerEvents` — pointer id/position statics, still used by
  `InventoryController`'s touch-aware block drag.
- `PopoverCoordinator` — `active_popover` with `present()` / `is_open()` /
  `close_active()`. No shared-mode string: every popover (Quest, Chat, Power,
  Team Inventory) is its own instance now, so `is_open()` just compares against
  `active_popover`.
- `BlockData` — `normalize_block` / `calculate_block_height` statics (shared by
  inventory, draw pile, and the Team Inventory popover).

View controllers (Node):
- `DebugPanelController` — the entire tabbed debug overlay: slider/label wiring,
  `apply_config()`, `toggle()`/`set_open()`/`is_open()`.
- `ScorePopupController` — score-event dedup, popup spawn/animation, and
  `get_score_popup_position()` (viewport-ratio based).
- `LevelSummaryController` — owns the two one-shot `Timer`s, queues the summary
  after the score-popup batch fades, and builds the summary/impact-failure text.
- `RosterViewController` — the player rail, per-player [[Impact Bar]] track, and
  score tints; exposes `rail_entry()`/`rail_box()` (chat-bubble anchors) and
  `apply_score_tint()`.
- `QuestController` — the three-state quest chip and its popover.
- `QuickChatController` — the Quick Chat popover rows (tap-to-send, cooldown-gated),
  incoming chat events, and the speech-bubble anchored to the sender's rail row.
  The earlier `QuickChatButton1-3` — dead code, hidden in `LegacyHidden` and
  never reachable by players — have been removed along with `bind_nodes()`'s
  binding and `update_quick_chat_buttons()`.
- `PowerController` — the Power popover rows (tap-to-activate; `activate_power`
  has no target field, so the effect always applies room-wide), activation
  toast, and room-wide tint. The earlier drag-onto-target UI (`PowerButton1-3`,
  `PowerTargetBox`) was dead code — never reachable by players, hidden in
  `LegacyHidden` — and has been removed along with its handling in this
  controller.
- `InventoryController` — the 3-slot inventory cards, drag-to-place input, the
  local placement cooldown, and the draw-pile preview.
- `TopBarController` — level badge, round timer, tower height/progress
  indicators, and tower-stability readout.

## Public interface (driven by [[NetworkManager]] signals)
`update_status`, `update_connect_button`, `update_room(data)`,
`update_room_closed(data)`, `update_game_state(data)`, `update_debug_config(config)`
— all connected in `connect_network_signals()`. Action handlers now live on the
owning controller (`inventory.on_block_pressed`, `chat.on_quick_chat_pressed`,
`power.open_power_popover`, `quest.on_quest_chip_pressed`), reached through the
module handles rather than as methods on Main.

## Depends on
- Internal: [[NetworkManager]] (all server I/O), [[Godot Client App]],
  [[Game UI Scene]] (the bound node contract), [[Block Preview]], [[Tower Stack]],
  [[Cooldown Overlay]], [[Debug Overlay]], [[Player Colors]], [[Popover Panel]],
  [[Impact Bar]]
- External: none

## Notes
- **Zero behavior change was the decomposition's success criterion.** Behavior
  moved verbatim; only references were rewritten to the injected services.
  Characterization coverage was added first under `Tests/Gut/GameUi/`
  (see [[Godot Client Tests]]).
- **Each popover trigger connects its own native `.pressed` signal**
  (`QuestChip`, `QuickChatTrigger`, `TeamInventoryButton`, `PowerTrigger`), not
  a shared `_input()` hit-test router. This replaced an earlier
  `PointerTriggerRouter` that hit-tested trigger rects in `_input()` because a
  popover's full-screen `OutsideCatcher` — a later sibling than the triggers in
  [[Game UI Scene]] — otherwise wins normal GUI hit-testing while a popover is
  open. Each trigger's opener (`open_team_inventory_popover`,
  `chat.open_quick_chat_popover`, `power.open_power_popover`,
  `quest.on_quest_chip_pressed`) now checks `should_block_popovers()` itself
  (debug overlay open or level-summary visible) instead of a router guard.
  `PointerTriggerRouter.gd` and its dedicated test were deleted as dead code
  once nothing referenced them. Quest, Chat, and Team Inventory triggers were
  confirmed working after this change; Power's trigger tap still looked broken
  ("does nothing" on a single tap, then intermittently opened on repeated
  taps on both Android and WebGL). That intermittency was a same-tap
  self-close race in [[Popover Panel]], not anything specific to Power's
  wiring — see its Notes for the fix (`OUTSIDE_TAP_GRACE_MS`). The other three
  triggers likely had the same latent race; it just wasn't exercised enough
  in casual testing to surface as visibly.
- **`ScorePopupLayer` ships `visible = false`** in [[Game UI Scene]];
  `ScorePopupController.bind_nodes()` re-enables it, since Godot hides a hidden
  `CanvasItem`'s whole subtree and would otherwise block every popup/bubble.
- Score events are de-duplicated by stable event id per level. Placement popups
  use `placementScorePopupDurationMs`; MVP/Perfect-Fit/Impact/finisher/bonus
  popups use `finishScorePopupDurationMs`.
- Each rail player's [[Impact Bar]] fill is `bandScore / requiredBandScore` plus
  the locally-tracked live `levelScore` **only** while `is_playing()`, to avoid
  double-counting a just-completed level during the finished/failed transition.
- The top-bar round timer only counts down locally while `is_playing()`; while
  frozen it changes only when the next `game_state` broadcast arrives.
- **Popover card mis-positioning on WebGL/Android and Power's trigger tap** are
  not reproducible in the editor.
- Has no full behavioral test coverage of the orchestrator's fan-out beyond the
  characterization suite; sizable changes are still verified by manual
  play-testing and CI's smoke test.
