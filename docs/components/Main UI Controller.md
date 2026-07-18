# Main UI Controller

## Purpose
Godot UI controller for the main game screen — the single script that wires
input, renders server state, and hosts debug tuning for the active skin.
File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire connect, block drag-and-drop placement, and refresh buttons.
- Display connection, room, score, checkpoint minimum-score status, timer,
  tower height/progress, 3-slot block inventory, draw-pile preview, and
  refresh state.
- Render shape-based block inventory cards from server-provided
  fixed-orientation cells.
- Render placed blocks in the center tower area from server `towerBlocks`
  history.
- Render score popups from server `scoreEvents` and level-end summaries from
  `lastLevelSummary`.
- Send block and refresh actions.
- Load the selected UI skin and bind the shared skin node contract; switch
  skins at runtime without touching gameplay/network logic.
- Host debug tuning through an overlay instead of embedding it in gameplay
  layout.
- Clear stale UI on `room_closed`.

## Public interface
- **Driven by [[NetworkManager]] signals**: `update_status`,
  `update_connect_button`, `update_room(data)`, `update_room_closed(data)`,
  `update_game_state(data)`, `update_debug_config(config)` — all connected in
  `connect_network_signals()`.
- **UI action handlers**: `on_connect_pressed`, `on_block_pressed(index)`,
  `on_refresh_pressed`, `on_quick_chat_pressed(slot)`, plus the drag-input
  handlers (`begin_block_drag`, `update_block_drag`, `finish_block_drag`,
  `cancel_block_drag`) — all call back out through [[NetworkManager]].
- **Skin lifecycle**: `load_skin(skin_name)`, `switch_skin(skin_name)`,
  `bind_skin_nodes()` — used by the skin-picker overlay and at startup.

## Depends on
- Internal: [[NetworkManager]] (all server I/O), [[Godot Client App]] (the
  project it's the controller for), [[Block Preview]] (inventory/drag
  shapes), [[Tower Stack]] (placed-block rendering), [[Cooldown Overlay]]
  (per-card cooldown rings), [[Debug Overlay]] (debug panel shell),
  [[Player Colors]] (player color lookups)
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
- Score events are tracked by stable event id per level so reconnects, skin
  switches, and repeat broadcasts don't duplicate animations. Placement
  popups use `placementScorePopupDurationMs`; MVP/Perfect-Fit/checkpoint/
  finisher/bonus popups use `finishScorePopupDurationMs` — both durations
  cover the full popup lifetime including fade-out.
- Level score summaries wait for the current score-popup batch to fade, then
  show complete/failed state, exact/overbuild result, team score, MVP,
  finisher, and per-player level/final totals before auto-hiding after
  `levelSummaryDelayMs`.
- Debug overlay controls route every change through
  `NetworkManager.update_config`, using no-signal setters while syncing from
  the server so an incoming config update doesn't re-trigger the handler
  that sent it. The 26 slider handlers that just forward a value are wired as
  inline lambdas straight to two shared helpers, `send_debug_int` /
  `send_debug_float`, at their `configure_slider(...)` call site in
  `setup_debug_controls()` — only handlers with an extra local side effect
  (popup/summary duration sliders, which also cache the value locally for
  the popup-timing code above) keep a named function. Reset sends
  `resetDebugConfig` and lets the server rebroadcast defaults; the panel is
  tabbed into Bots, Round, UI, Supply, Refresh, and Scoring.
- UI is an Android-first HUD: top status, center tower stage, bottom touch
  controls (3 inventory cards, 1 shared next-draw preview card, refresh
  button). Debug and skin menus are bottom-right floating buttons with
  overlay panels. The center tower is visual only — placement is still
  server-authoritative and index-based.
- Has no behavioral test coverage (see [[Godot Client Tests]]) — sizable
  changes here are currently verified by manual play-testing / CI's smoke
  test, not automated regression tests.
