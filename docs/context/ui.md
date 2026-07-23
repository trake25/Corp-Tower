# UI (Godot Client)

Scope: the Godot client's presentation layer — screen flow, the main gameplay HUD, and every leaf visual component. Wire protocol → [networking.md](./networking.md). Client shell/build config → this file's first section. Test coverage → [testing.md](./testing.md#godot-client-tests).

All paths under `src/Client/App/corp-tower/` unless noted.

## Godot Client App (shell)

Project root. Android-first client; connects through [NetworkManager](./networking.md#networkmanager), renders room/level/timer/tower/score/inventory state, sends player actions. **Reflects server state — never calculates final gameplay locally.**

- `project.godot` autoloads NetworkManager as a singleton.
- Display contract: 412×917 portrait design size, `canvas_items` stretch mode, per-platform stretch aspect — `expand` by default (Android fills any phone aspect), overridden to `keep` for web (`window/stretch/aspect.web`) so the browser pillarboxes to 412:917 instead of widening the viewport.
- `Main.tscn` is the app root, owning [Screen Manager](#screen-manager). It swaps between join screen, find-match screen, and the instanced [Game UI Scene](#game-ui-scene) — there is no single statically-instanced UI root scene.
- Android export config lives in the gitignored local `export_presets.cfg`; CI uses a non-secret preset (see [build.md](./build.md#client-android-internal-workflow)).
- Current release target is **Android only**; web/Windows/iOS are future, not active.

**Gotchas:**
- `window/handheld/orientation` must be the Godot 4 integer `1` (`SCREEN_PORTRAIT`), not a Godot 3–style string — a string silently coerces to `0` (landscape) with **no warning**. This is what shipped every Android build in forced landscape until corrected; check this first if orientation ever regresses, since the string form *looks* correct.
- `expand` vs `keep` produce genuinely different viewport sizes, not just different letterboxing — under `expand` the viewport grows past 412×917 to match window aspect; under `keep` it stays exactly 412×917. They coincide only when the run window is already 412×917, which is why the **editor looks identical under either setting and cannot validate web layout**. Verify web layout from a deployed build ([build.md](./build.md#client-html5-pages)).
- Debug tuning is a floating tabbed overlay ([Debug Overlay](#leaf-components)) toggled by a single global draggable button owned by Screen Manager — present in every build, not gated by any build flag (only disabled, not hidden, until a room connects). See [decisions.md](./decisions.md#debug-menu--debug-config-not-yet-gated).

## Screen Manager

`Cor/Scripts/ScreenManager.gd`, attached to `Main.tscn` — app-level root controller owning screen flow and the single global debug toggle button.

- Swaps join screen / find-match screen / live [Game UI Scene](#game-ui-scene) inside `ScreenContainer`, responding to the child screens' `find_match_requested`/`cancel_requested` and NetworkManager's `room_joined`/`room_closed`.
- Instantiates `PlayScreenScene` once per joined room, frees it on room close — not kept resident.
- Owns one floating, draggable debug button above whichever screen is active. Distinguishes tap vs. drag via `DEBUG_BUTTON_DRAG_THRESHOLD`. Gated (enabled) only when a live play instance exists with a `toggle_debug_overlay()` method **and** `NetworkManager.is_conn_estab` is true.

**Interface:** `show_join_screen()`, `show_find_match_screen()`, `reset_debug_button_position()` (snaps to top-right; called on `_ready()` and on room join — not after a manual drag, so a player's drag persists until the next room join), `_on_debug_button_tapped()` (calls `play_instance.call("toggle_debug_overlay")` via duck typing — no static dependency on Main UI Controller).

**Depends on:** NetworkManager (`room_joined`, `room_closed`, `status_changed`, `is_conn_estab`); Main UI Controller (duck-typed call only); the join/find-match scenes (thin — they only emit their request/cancel signal and mirror `status_changed` into a label; not separately documented).

**Notes:** debug button's default spot moved bottom-right → top-right to avoid the join/find-match screens' primary action buttons. It's intentionally ungated by any build flag (pre-release requirement to fix: [decisions.md](./decisions.md#debug-menu--debug-config-not-yet-gated)).

## Main UI Controller

`Cor/Scripts/Main.gd` — was a single ~2,700-line script; now a slim (~415-line) orchestrator owning engine callbacks and server-signal fan-out, delegating everything to single-purpose modules under `Cor/Scripts/GameUi/`. Module shape convention → [coding-conventions.md](./coding-conventions.md#client-gameui-module-family-pattern).

**Orchestrator responsibilities:**
- Constructs shared services/controllers in `_ready()` (code-created children, never scene nodes); binds the [Game UI Scene](#game-ui-scene) node contract once via `UiNodeBinder`; aborts via `prepare_ui()` if a required node is missing.
- Owns Godot input/frame callbacks: `_input()` → `inventory.handle_input()` only (each popover trigger connects its own signal — see Notes); `_process()` → `inventory.tick()`, `top_bar.tick_round_timer()`; `_unhandled_input()` → closes the debug overlay on `ui_cancel`.
- Wires the six NetworkManager signals in `connect_network_signals()`; hosts `update_game_state()` as the fan-out pushing each `game_state` slice to its module.
- Small direct surface: `toggle_debug_overlay()` (duck-typed from Screen Manager), `on_connect_pressed()`, `should_block_popovers()` (shared guard passed into each controller), connection/room/status handlers.
- Exposes `missing_required_nodes` (read by the [smoke test](./testing.md#godot-client-tests)) and every module handle (`inventory`, `power`, `roster`, `score_popups`, `summary`, `quest`, `chat`, `top_bar`, `debug_panel`, `popovers`, `players_ctx`, `match_state`, `tuning`).

**Module family (`Cor/Scripts/GameUi/`):**

*Shared services (RefCounted):*

| Module | Purpose |
|---|---|
| `UiTuning` | The four client-tuning values (`placement_cooldown_ms`, placement/finish popup durations, `level_summary_delay_ms`) from `debug_config` + `game_state` |
| `MatchState` | `current_match_state`, `current_level`, `impact_interval`, `is_playing()` |
| `PlayerContext` | Roster/color-map/seat-index + color/display-name/`is_local` helpers (consolidates scattered `NetworkManager.player_id` checks + Player Colors lookups) |
| `UiNodeBinder` | Wraps `find_child` node-contract binding; collects missing required names |
| `PointerEvents` | Pointer id/position statics; used by `InventoryController`'s touch-aware drag |
| `PopoverCoordinator` | `active_popover` + `present()`/`is_open()`/`close_active()` — every popover is its own instance, so `is_open()` just compares against `active_popover` |
| `BlockData` | `normalize_block`/`calculate_block_height` statics, shared by inventory and the draw-pile preview in the always-visible [Team Inventory Panel](#team-inventory-panel) |

*View controllers (Node, `add_child`-ed by Main):*

| Module | Purpose |
|---|---|
| `DebugPanelController` | Entire tabbed debug overlay: slider/label wiring, `apply_config()`, `toggle()`/`set_open()`/`is_open()`, header Reset/Restart actions (`on_reset_debug_pressed()` sends `resetDebugConfig`; `on_restart_level_pressed()` sends the `restartLevel` action key then closes the overlay via `set_open(false)` — see [gameplay.md](./gameplay.md#debug-menu-and-live-tuning)) |
| `ScorePopupController` | Score-event dedup, popup spawn/animation, `get_score_popup_position()` (viewport-ratio based) |
| `LevelSummaryController` | Owns the two one-shot `Timer`s; queues the summary after the score-popup batch fades; builds summary/impact-failure text |
| `RosterViewController` | Player rail + per-player [Impact Bar](#leaf-components) track; exposes `rail_entry()`/`rail_box()` (chat-bubble anchors) |
| `QuestController` | Three-state quest chip + its popover |
| `QuickChatController` | Quick Chat popover rows (tap-to-send, cooldown-gated), incoming chat events, sender-anchored speech bubble. Dead `QuickChatButton1-3` code (never reachable) removed along with its binding |
| `PowerController` | Power popover rows (tap-to-activate; no target field, effect always room-wide) + activation toast. Dead drag-onto-target UI removed; legacy room-wide score-rail tint on activation also removed — toast is the sole feedback |
| `InventoryController` | 3-slot inventory cards, drag-to-place input, local placement cooldown, draw-pile preview shown in the always-visible [Team Inventory Panel](#team-inventory-panel) |
| `TopBarController` | Level badge, round timer, tower height/progress, tower-stability readout, three-state Top Indicator (see Notes) |

**Interface (driven by NetworkManager signals):** `update_status`, `update_connect_button`, `update_room(data)`, `update_room_closed(data)`, `update_game_state(data)`, `update_debug_config(config)` — all wired in `connect_network_signals()`. Action handlers live on the owning controller (`inventory.on_block_pressed`, `chat.on_quick_chat_pressed`, `power.open_power_popover`, `quest.on_quest_chip_pressed`).

**Depends on:** NetworkManager (all server I/O), Godot Client App, Game UI Scene (bound node contract), and every leaf component below.

**Notes:**
- **Zero behavior change was the decomposition's success criterion** — behavior moved verbatim, only references rewritten to injected services. Characterization coverage under `Tests/Gut/GameUi/` was added first (see [testing.md](./testing.md#godot-client-tests)).
- Each popover trigger (`QuestChip`, `QuickChatTrigger`, `PowerTrigger`) wires its own `.pressed` signal — see [coding-conventions.md](./coding-conventions.md#client-gameui-module-family-pattern) and [decisions.md](./decisions.md#pointertriggerrouter-removed--native-per-trigger-signals) for why.
- `ScorePopupLayer` ships `visible = false` in Game UI Scene; `ScorePopupController.bind_nodes()` re-enables it, since Godot hides a hidden `CanvasItem`'s whole subtree (which would otherwise block every popup/bubble).
- Score events dedup by stable event id per level.
- Each rail player's Impact Bar fill = `bandScore / requiredBandScore` **plus** the locally-tracked live `levelScore` only while `is_playing()` — avoids double-counting a just-completed level during the finished/failed transition.
- The top-bar round timer counts down locally only while `is_playing()`; while frozen it changes only on the next `game_state` broadcast.
- **Top Indicator** (`TopIndicatorRow` in Game UI Scene) is a three-state progress readout, driven purely client-side by `TopBarController.set_top_indicator_progress(current_height, target_height)` off the same `current_height`/`target_height` the tower-progress bar uses — display only, no new server data. States: **TOP** (`current < target`) — green→lime fill sized to progress ratio, plain white `TopBarFramePanel` frame; **PERFECT BUILD** (`current == target`) — full green→lime fill, gold-bordered `TopBarFrameAchievedPanel` frame (`Cor/Themes/GameUITheme.tres`); **OVER BUILD** (`current > target`) — full fill swapped to the red→orange `Cor/Themes/TopIndicatorFillOver.tres` texture, same gold-bordered frame. Label text mirrors the state, e.g. `"PERFECT BUILD (1000/1000)"`. Corresponds to the [Exact finish/Precision and Overbuild](./glossary.md#gameplay-terms) gameplay terms, which still solely govern actual bonus scoring.
- Popover card mis-positioning on WebGL/Android and Power's trigger-tap issue are **not reproducible in the editor** — always verify UI-timing fixes on a deployed build.
- `_ready()` connects [Tower Stack](#leaf-components)'s `scroll_offset_changed` signal straight to `background_parallax.set_scroll_pixels` (the bound `BgArt` node) right after `setup_popover_controls()` — guarded with `tower_stack.has_signal("scroll_offset_changed")` since `tower_stack`/`background_parallax` are declared as plain `Control`, the same has_signal/Callable duck-typing style Screen Manager uses for its own cross-module call (see `_on_debug_button_tapped()` above).
- No full behavioral test coverage of the orchestrator's fan-out beyond the characterization suite; sizable changes still need manual play-testing + CI's smoke test.

## Game UI Scene

`Cor/Scenes/GameUI.tscn`, themed by `Cor/Themes/GameUITheme.tres` — the single scene hosting every HUD/debug node Main binds against. Instanced dynamically by Screen Manager once a match is found (not a static child of `Main.tscn`); required at runtime.

**Node contract highlights:** `TowerDropZone` (full-rect control validating a drag-release position), `DragPreview` (hidden Block Preview instance shown while dragging).

**Notes:**
- Formerly one of two swappable "skins" — see [decisions.md](./decisions.md#ui-skin-switching-system-removed). No `ProjectSettings` skin preference or skin-picker group exists anymore.
- The `.tres` theme defines shared `theme_type_variation` styles (`ActionButton`, `CircleButtonPanel`, `HudPanel`, `WhiteCardButton`, `TopBarFramePanel`/`TopBarFrameAchievedPanel`/`TopBarTrackPanel`, `TowerFillPanel`/`TowerTrackPanel`); most per-node fine-tuning is still inline `theme_override_*` properties. `TopBarFrameAchievedPanel` is swapped onto `TopIndicatorFrame` at runtime by `TopBarController` (not statically assigned in the scene) — see [Top Indicator](#main-ui-controller).
- The three [Popover Panel](#popover-panel) instances each override their `Card` node with an explicit `custom_minimum_size` — `260x163` for `ChatPopover`/`PowerPopover`, `260x140` for `QuestPopover`. This is the authored source of the fixed card size `get_card_size()` returns — change a popover's design size here.
- **`mouse_filter` gotcha:** non-interactive nodes positioned over/near a tappable control must set `mouse_filter = 2` (ignore) — Godot's default `mouse_filter = 0` (stop) swallows touches even for nodes that draw nothing there. `ImpactTrack` (the Impact Bar column) overlaps ~80% of `PowerTrigger`'s tap area and was missing this, making the Power icon tap inconsistent until fixed. Check new overlay/decorative nodes against nearby interactive controls before assuming the default is harmless.
- `BgArt` (the background `TextureRect`) carries `unique_name_in_owner = true` and the [Background Parallax](#leaf-components) script directly — there is no separate parallax node layered on top.

## Team Inventory Panel

`TeamInventoryPanel` node in [Game UI Scene](#game-ui-scene) (`PlayField/TeamInventoryPanel`, `PanelContainer` themed with the `WhiteCardPanel` variation) — a permanently-visible bar showing the shared draw pile's next-brick preview and remaining count. Replaced an earlier tap-to-open "Team Inventory" popover (see [decisions.md](./decisions.md#team-inventory-popover-removed--always-visible-team-inventory-panel)).

- Hosts the same `DrawPilePreview` (Block Preview instance)/`DrawPileNameLabel`/`DrawPileCountLabel` nodes [InventoryController](#main-ui-controller) already drove for the old popover — only their parent/position changed (out of a hidden legacy container into this always-shown bar), so no controller logic changed. `InventoryController.update_draw_pile_ui()` sets `DrawPileNameLabel` to the constant `"Next Draw"` (never the next block's shape id — the preview icon already shows the shape), `DrawPileCountLabel` to `"<count> Remaining Bricks"`, and colors the preview with `players_ctx.local_color()` (matches the personal inventory cards, not a fixed draw-pile color).
- Row layout is a left-aligned (`alignment = 0`) `HBoxContainer` — center alignment was tried first and rejected because a `VSeparator` between the two labels crowded against the panel's right edge once the count label's text grew to `"Remaining Bricks"` phrasing; see [decisions.md](./decisions.md#team-inventory-popover-removed--always-visible-team-inventory-panel).
- `DrawPileNameLabel`/`DrawPileCountLabel` need an explicit `theme_override_colors/font_color` (`Color(0.1, 0.1, 0.12, 1)`, matching `PopoverBodyLabel`/`RailScoreLabel`) — the `CardMetaLabel` theme type variation they use has no font color of its own, so it falls through to the theme's default near-white, which is invisible on `WhiteCardPanel`'s white background. Any other label placed on a white card background needs the same override.
- `QuickChatTrigger`/`QuickChatTriggerCircle` moved into the screen position the removed `TeamInventoryButton` used to occupy; `PowerTrigger` is unchanged. `TeamInventoryPanel` occupies the row space `QuickChatTrigger` used to sit in.

## Popover Panel

`Cor/Scripts/PopoverPanel.gd`, scene `Cor/Scenes/PopoverPanel.tscn` — reusable anchored card (title, rule, row list) used for every tap-triggered popover.

**Interface:** `set_title(text)`, `clear_rows()`, `add_row(text) -> Label` (single-line, `clip_text` on — overflow clips rather than wrapping/growing the card), `add_action_row(text, on_pressed) -> Button`, `add_icon_row(icon, text) -> HBoxContainer`, `open()`/`close()`, `dismissed` signal, `get_card_size() -> Vector2` (floors `get_combined_minimum_size()` by `custom_minimum_size` — returns the fixed design size for typical short content), `set_card_global_position(target)` (resets anchors to top-left, places top-left at `target` clamped to the visible rect).

- Auto-closes after `auto_close_seconds` (default 4s), on outside tap (full-screen `OutsideCatcher`, ignoring presses for `OUTSIDE_TAP_GRACE_MS` after `open()` — see below), or when the owner explicitly closes it (e.g. on drag start). Never pauses gameplay underneath it.
- Three instances in Game UI Scene: `ChatPopover`, `PowerPopover` (bottom-right, near their trigger buttons), `QuestPopover` (top-left, next to the Quest chip). Each controller computes its own card position from its trigger's live `get_global_rect()`.
- Only one popover open at a time (`PopoverCoordinator.close_active()` on open). Starting a block drag also closes the active popover. All three triggers **toggle** — tapping an already-open trigger closes it, checked via the popover's live `.visible` (`PopoverCoordinator.is_open()`), not just last-known bookkeeping, since `close()` can fire asynchronously from the auto-close timer or an outside tap.

**Depends on:** none (rows/icons are handed to it fully built by the caller).

**Notes — two fixed bugs:**
- **Same-tap self-close race (Android + WebGL), fixed.** `OutsideCatcher` is a full-screen `mouse_filter=STOP` Control, so once open it covers the trigger's own screen position too. Every physical tap on Android/WebGL produces a real input event *and* an emulated partner (`emulate_mouse_from_touch`, on in `project.godot`); the trigger's `.pressed` consumes one, and the other landed on the now-visible `OutsideCatcher` and closed it again on the same tap — a timing race ("opens only sometimes" on repeated taps). Fix: `open()` stamps `opened_at_ms`; `_on_outside_catcher_gui_input` ignores presses within `OUTSIDE_TAP_GRACE_MS` (250 ms) of that stamp. Doesn't affect toggle-close or switching triggers (both call `close()` directly, bypassing `OutsideCatcher`). This was discovered via Power's trigger looking broken, but the root cause affected every popover trigger equally (at the time, including the since-removed Team Inventory popover) — see [decisions.md](./decisions.md#pointertriggerrouter-removed--native-per-trigger-signals).
- **Card size, fixed at the source; on-device verification pending.** Cards used to size purely from content (base `Card` floored only width). Power measured shorter than Chat, and — because the y-anchor is `trigger.y - 13 - card_height` — their bottom edges drifted off Chat's baseline; a wrapped long Quest label grew that card past its 140 design height. Fixed with explicit `custom_minimum_size` per popover + single-line `clip_text` rows so long text can't inflate the card either way. Editor and GUT layout tests confirm sizes/baseline, but the editor only runs at 412×917 design size — **a deployed WebGL or Android build is still required to confirm the on-device symptom is resolved.**

## Leaf components

| Component | File | Interface | Notes |
|---|---|---|---|
| **Block Preview** | `Cor/Scripts/BlockPreview.gd` | `set_block(block: Dictionary)`, `clear_block()`, `set_preview_mode(mode)` (`INVENTORY` / `FLOATING_DRAG`), `cell_color: Color` | Visual-only, never decides placement legality. Driven entirely by Main UI Controller; holds no gameplay state. Supports array- and dictionary-style cell coordinates from the server payload. |
| **Tower Stack** | `Cor/Scripts/TowerStack.gd` | `set_tower(blocks, height, target_height, stability=100, diagnostics={})`, `set_player_color_map(map)`, `clear_tower()`, `scroll_offset_changed(pixels: float)` signal | Visual-only; server owns tower state. Brick size is fixed at `BRICK_UNIT_SIZE` (34px design units) — bricks never shrink to fit, regardless of tower height; see [decisions.md](./decisions.md#fixed-brick-size--parallax-scroll-replaces-shrink-to-fit-tower-rendering). Once the stack's focus height exceeds what fits in the visible draw area, `_scroll_offset_units()` shifts the drawn tower up (keeping `SCROLL_HEADROOM_UNITS` of headroom above the top brick) and off-screen bricks are clipped via `_is_rect_visible()` — this scroll/clip path used to only trigger in the rare case where shrink-to-fit bottomed out at the old `MIN_UNIT_SIZE`; it's now the primary mechanism for any tower taller than the visible area, with no upper bound (unlimited pan). Emits `scroll_offset_changed(pixels)` whenever the pixel scroll amount changes (deduped via `_last_scroll_pixels`) — consumed by [Background Parallax](#leaf-components) via [Main UI Controller](#main-ui-controller). Tilt has two layers: `tower_tilt_deg` (target lean, from `diagnostics.tiltAngleDeg`) and `displayed_tilt_deg` (eased via `TILT_EASE_SPEED`, glides toward target — smoothing only, the underlying tilt is fully server-recalculated on every placement, never animated server-side). Once `diagnostics.collapsed` is true, rendering exaggerates lean to a fixed `COLLAPSE_TILT_DEG` (70°) — well past the live-play cap (`towerMaxTiltAngleDeg`, typically 24°) — a purely cosmetic "sell the collapse" flourish for an already-ended level. Rotates around a bottom-center pivot (matches where it rests on the ground); visibility culling done in pre-rotation space as a cheap approximation, fine at live-play angles and the bounded post-collapse angle. |
| **Background Parallax** | `Cor/Scripts/BackgroundParallax.gd` | `set_scroll_pixels(pixels: float)` | Visual-only leaf script attached directly to the `BgArt` `TextureRect` in [Game UI Scene](#game-ui-scene) (not a separate node). Eases `BgArt`'s vertical position toward `pixels * PARALLAX_RATIO` (0.4) via `EASE_SPEED`-driven `lerpf`, so the background pans down slower than the tower scrolls up — simulates a camera panning up into the tower. Panning `BgArt` down reveals the existing full-screen `Background` `Panel` behind it (solid sky-blue `Color(0.55, 0.83, 0.96, 1)` from the theme's panel style) above `BgArt`'s new position, standing in for extra sky as a placeholder — no new node was added for this fill. Driven by [Tower Stack](#leaf-components)'s `scroll_offset_changed` signal, wired in [Main UI Controller](#main-ui-controller). Asset implication: since a flat color has no edge, it trivially supports unlimited pan; a future real art replacement must be a seamlessly vertically-tileable sky/cloud texture (top edge matching bottom edge) to preserve that, delivered through the existing [Private Asset Pipeline](./build.md#private-asset-pipeline) — see [decisions.md](./decisions.md#fixed-brick-size--parallax-scroll-replaces-shrink-to-fit-tower-rendering). |
| **Impact Bar** | `Cor/Scripts/ImpactBar.gd`, scene `ImpactBar.tscn` | `set_bar(seat_color: Color, ratio: float)` | Vertical gradient fill (lightened top/darkened bottom); `anchor_top = 1.0 - ratio`. Purely reactive, no polling of its own — Main's `update_impact_track()` computes the ratio once per broadcast. One instance per rail slot (up to `MAX_RAIL_PLAYERS`), keyed by player id, freed when a player drops out. Hosted in `ImpactTrack`, which sets `mouse_filter = 2` so it doesn't intercept `PowerTrigger` taps — see [Game UI Scene](#game-ui-scene) gotcha. |
| **Cooldown Overlay** | `Cor/Scripts/CooldownOverlay.gd` | `set_remaining_ratio(value: float)` (0.0 hidden → 1.0 full) | Visual-only, purely reactive; Main computes the ratio from local cooldown state and calls this once per frame. One instance per inventory card, found via `get_node_or_null("CooldownOverlay")` — must keep that exact node name in Game UI Scene. |
| **Debug Overlay** | `Cor/Scripts/DebugOverlay.gd` | `set_open(open: bool)`, `toggle()` | Lightweight show/hide shell only — sliders/toggles and server sync live in Main UI Controller's `DebugPanelController`. Server-side validation lives in [Lobby Manager](./backend.md#lobby-manager)/[Game Config](./backend.md#game-config). Expects unique-named descendants `%DebugDimLayer` and `%DebugPanel` — a replacement scene must replicate these exact names. |
| **Player Colors** | `Cor/Scripts/PlayerColors.gd` | `color_for_player_id(player_id) -> Color`, `color_for_player_index(player_index) -> Color` (wraps `PLAYER_COLORS`, `FALLBACK_COLOR` for negative index), `FALLBACK_COLOR` | Used by Main UI Controller and Tower Stack — both `preload()` this directly so color assignment has one home. |

## Godot Client Tests (pointer)

Smoke test + GUT coverage for this layer. Full detail → [testing.md](./testing.md#godot-client-tests).
