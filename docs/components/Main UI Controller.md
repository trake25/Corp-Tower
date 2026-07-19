# Main UI Controller

## Purpose
Godot UI controller for the main game screen — the single script that wires
input, renders server state, and hosts debug tuning.
File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire connect and block drag-and-drop placement.
- Display connection, room, score, Impact minimum-score status (including a
  per-player [[Impact Bar]] rail showing live progress toward the next
  Impact checkpoint), timer, tower height/progress, and 3-slot block
  inventory with draw-pile preview.
- Render shape-based block inventory cards from server-provided
  fixed-orientation cells.
- Render placed blocks in the center tower area from server `towerBlocks`
  history.
- Render score popups from server `scoreEvents` and level-end summaries from
  `lastLevelSummary`.
- Render quick-chat buttons/cooldown; incoming `quickChatEvents` show as a
  transient speech bubble anchored to the sender's row in the player rail
  (falls back to a generic score-event popup if the sender has no rail
  entry, e.g. an unseated/legacy id).
- Render the Team Inventory, Quick Chat, Power, and Quest triggers as four
  [[Popover Panel]] popovers (Team Inventory/Quick Chat/Power share one
  instance; Quest has its own); all four toggle closed on a repeat tap of
  their own trigger instead of reopening. Tapping a row in the Power popover
  activates that item immediately (room-wide, no target selection); render
  Power activation results as a toast plus a 4s score-color tint. The older
  drag-a-Power-slot-onto-a-player-target flow (`power_buttons`,
  `power_dragging`, `power_target_buttons`) is still wired but now dead code
  — its source nodes live under `LegacyHidden` in [[Game UI Scene]] and are
  never shown.
- Drive the Quest chip's three-state icon (unclaimed-unseen /
  unclaimed-seen / claimed) from `sideQuest`, and open/toggle its popover on
  tap.
- Send block, quick-chat, and Power actions (Power activation is also how a
  refresh happens — there is no separate refresh button/action).
- Bind the game UI scene's required node contract once at startup.
- Host debug tuning through an overlay instead of embedding it in gameplay
  layout.
- Clear stale UI on `room_closed`.

## Public interface
- **Driven by [[NetworkManager]] signals**: `update_status`,
  `update_connect_button`, `update_room(data)`, `update_room_closed(data)`,
  `update_game_state(data)`, `update_debug_config(config)` — all connected in
  `connect_network_signals()`.
- **UI action handlers**: `on_connect_pressed`, `on_block_pressed(index)`,
  `on_quick_chat_pressed(slot)`, plus the drag-input handlers
  (`begin_block_drag`, `update_block_drag`, `finish_block_drag`,
  `cancel_block_drag`) — all call back out through [[NetworkManager]].
- **UI setup**: `bind_ui_nodes()`, `prepare_ui()` — bind the game UI scene's
  node contract once at `_ready()`. [[Game UI Scene]] itself has no internal
  skin-swapping; it is [[Screen Manager]] that instances/frees this whole
  controller+scene pair as the player enters/leaves a match.
- **Called by [[Screen Manager]]**: `toggle_debug_overlay()` is invoked via
  duck-typed `call()` from the app-level global debug button; this script
  never calls back into Screen Manager.

## Depends on
- Internal: [[NetworkManager]] (all server I/O), [[Godot Client App]] (the
  project it's the controller for), [[Game UI Scene]] (the scene it binds
  against), [[Block Preview]] (inventory/drag shapes), [[Tower Stack]]
  (placed-block rendering), [[Cooldown Overlay]] (per-card cooldown rings),
  [[Debug Overlay]] (debug panel shell), [[Player Colors]] (player color
  lookups), [[Popover Panel]] (Team Inventory/Quick Chat/Power/Quest)
- External: none

## Notes
- Inventory cards use touch/mouse drag instead of tap-to-place. A drag
  starts only on active inventory slots with a block, while match state is
  `playing`, and while the local placement cooldown has elapsed; locked and
  empty slots stay visible but never start a drag. Release inside
  `TowerDropZone` sends the existing index-based `place_block` request;
  release outside cancels locally without contacting the server. Drag
  coordinates never affect placement or tower geometry — the server contract
  stays index-based throughout.
- The draw-pile preview isn't clickable; it shows the shared next-refill
  block that whichever player places next will receive, and can legitimately
  read `0 left` (e.g. level 1 before any unused blocks have been banked).
- Inventory cards tolerate both legacy numeric blocks and
  `{ id, shapeId, cells, height }` block objects.
- Score events are tracked by stable event id per level so reconnects and
  repeat broadcasts don't duplicate animations. Placement popups use
  `placementScorePopupDurationMs`; MVP/Perfect-Fit/Impact/finisher/bonus
  popups use `finishScorePopupDurationMs` — both durations cover the full
  popup lifetime including fade-out.
- `ScorePopupLayer` (holds every score popup and the quick-chat bubble) ships
  `visible = false` in [[Game UI Scene]] and nothing re-enables it on its
  own — `bind_ui_nodes()` sets it back to `true` right after binding the
  node, since Godot hides a `CanvasItem`'s whole subtree when it's hidden,
  which would otherwise silently block every popup/bubble from rendering.
- Level score summaries wait for the current score-popup batch to fade, then
  show complete/failed state, exact/overbuild result, team score, MVP,
  finisher, and per-player level/final totals before auto-hiding after
  `levelSummaryDelayMs`.
- Team Inventory/Quick Chat/Power/Quest triggers are pressed via a global
  `_input()` rect-hit check (`_try_activate_popover_trigger()`), not each
  button's own `pressed` signal — those signals are intentionally left
  unconnected. Reason: every popover's full-screen `OutsideCatcher` is a
  later sibling than the trigger buttons in [[Game UI Scene]], so it always
  wins normal GUI hit-testing and would otherwise swallow a tap on a trigger
  (including a repeat tap on its own trigger, or a switch to a different
  one) while any popover is open — Godot never lets an event reach a Control
  underneath one that stops it. `_input()` fires before GUI routing, so
  checking the four trigger rects there and calling
  `get_viewport().set_input_as_handled()` lets one tap close whatever's open
  and open/toggle the tapped trigger in the same motion, regardless of
  z-order. The debug overlay and level-summary overlay are checked first and
  skip trigger handling entirely while visible, since the normal GUI routing
  those two otherwise rely on to block the HUD underneath never runs once
  `_input()` consumes the event.
- Quest chip state is derived from `sideQuest.label` (empty ⇒ not yet
  unlocked, e.g. before `powerUnlockLevel`) and `sideQuest.claimedBy`, which
  the server always sends as `null` (not an absent key) until someone claims
  it. `get_quest_claimed_by()` explicitly checks the value's type instead of
  comparing `str(...)` against `""`, since a null value doesn't hit `.get()`'s
  fallback and `str(null)` is a non-empty string — that mismatch previously
  showed "Claimed by \<null\>" and stuck the icon on its claimed state for
  every level past `powerUnlockLevel`, regardless of actual claim status. The
  claimed-by row's text color is the claiming player's color via
  `get_player_color()`. Tapping the chip marks the current level "seen"
  (idle icon), refreshes the icon immediately rather than waiting for the
  next `game_state`, and opens the Quest popover — or closes it if it's
  already open, same toggle-on-repeat-tap behavior as the other three
  popover triggers.
- The top-bar round timer (`timer_label` + `round_time_texture`) swaps to the
  frozen icon whenever match state isn't `playing`. `tick_round_timer()`
  returns immediately unless `current_match_state == "playing"`, so the
  local per-frame countdown only runs during active play; while frozen,
  `timer_label.text` only changes when the next `game_state` broadcast calls
  `update_top_bar_display()` (i.e. at the next state transition, not every
  second), using the server's `secondsRemaining` value for whichever state
  it's in (see [[Game Engine]]'s `getRemainingMs()`).
- Each rail player's [[Impact Bar]] fill ratio is `bandScore /
  requiredBandScore` from the server's `impactScoreStatus`
  (`update_impact_track()`), with the locally-tracked live `levelScore` for
  the current in-progress level added on top **only** while
  `current_match_state == "playing"`. The server folds a level's score into
  `player.score` (and therefore `bandScore`) the instant it completes, but
  doesn't zero `levelScore` until the next level's `startLevel()` actually
  runs — so during the `finished`/`failed` transition window between
  levels, adding `levelScore` unconditionally double-counted the level that
  just ended and showed the bar as already full before the next Impact
  checkpoint had actually been reached.
- Debug overlay controls route every change through
  `NetworkManager.update_config`, using no-signal setters while syncing from
  the server so an incoming config update doesn't re-trigger the handler
  that sent it. Slider handlers that just forward a value are wired as
  inline lambdas straight to two shared helpers, `send_debug_int` /
  `send_debug_float`, at their `configure_slider(...)` call site in
  `setup_debug_controls()` — only handlers with an extra local side effect
  (popup/summary duration sliders, which also cache the value locally for
  the popup-timing code above) keep a named function. The
  `towerStabilityFeedbackMode` and `debugBotStrategy` enum controls are
  `OptionButton`s that call `NetworkManager.update_config` directly instead,
  since they send a string rather than a number. Reset sends
  `resetDebugConfig` and lets the server rebroadcast defaults; the panel is
  tabbed into Bots, Round, UI, Supply, Scoring, Tower, and Power.
- UI is an Android-first HUD: top status, center tower stage, bottom touch
  controls (3 inventory cards, 1 shared next-draw preview card, Power item
  row). The debug overlay panel lives here, but its floating toggle button
  is owned by [[Screen Manager]], not this scene — it defaults to top-right
  and is user-draggable to anywhere on screen. The center tower is visual
  only — placement is still server-authoritative and index-based.
- Has no behavioral test coverage (see [[Godot Client Tests]]) — sizable
  changes here are currently verified by manual play-testing / CI's smoke
  test, not automated regression tests.
- `prepare_ui()` push_errors if the game UI scene is missing a node
  `require_node()` expects; there is no fallback scene to load anymore.
