# Main UI Controller

## Purpose
- Godot UI controller for the main game screen.
- File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire connect, block placement, and refresh buttons.
- Display connection, room, score, checkpoint minimum score status, timer, tower height/progress, 3-slot block inventory, draw pile preview, and refresh state.
- Render shape-based block inventory cards from server-provided fixed-orientation cells.
- Render the visible `nextDrawBlock` and remaining `drawPileCount` in the former 4th inventory-card position.
- Render locked inactive inventory slots from `activeInventorySlots` so low levels start with fewer usable slots.
- Render placed blocks in the center tower area from server `towerBlocks` history.
- Render score popups from server `scoreEvents` and level-end summaries from `lastLevelSummary`.
- Send block and refresh actions.
- Load the selected UI skin and bind the shared skin node contract.
- Switch skins at runtime through a bottom-right overlay without changing gameplay/network logic.
- Reintroduce debug tuning through an overlay instead of embedding it in gameplay layout.
- Clear stale UI on `room_closed`.

## Key Logic
- Inventory buttons map to block indexes.
- Only the 3 active inventory slots are actionable.
- Locked slots remain visible but disabled until their unlock level.
- The draw-pile preview is not clickable; it shows the shared next refill block that whichever player places next will receive.
- The draw-pile preview can legitimately show `0 left`, especially on level 1 before any unused blocks have been saved.
- Inventory cards tolerate legacy numeric blocks and new `{ id, shapeId, cells, height }` block objects.
- `BlockPreview.gd` draws inventory shape cells.
- `TowerStack.gd` draws placed-block tower history; when connected to an old numeric-block server it falls back to a simple stack from `currentHeight`.
- `TowerStack.gd` keeps readable cell size and scrolls the visible tower window upward when high-level towers exceed the track height.
- Tower center display visualizes both current height against target height and the placed-block stack.
- Score events are tracked by stable event id per level so reconnects, skin switches, and repeat broadcasts do not duplicate animations.
- Placement popups use player color and `placementScorePopupDurationMs`; MVP, Perfect Fit, team total, checkpoint, finisher, and bonus-style popups use `finishScorePopupDurationMs`. These durations cover the full popup lifetime, including fade-out; finish-style popups fade and float across the configured duration instead of using a short capped fade.
- Exact finish shows `PERFECT FIT`; overbuild shows target reached with wasted height; MVP/team total use larger callouts.
- Checkpoint score-gate failures show a distinct checkpoint failure callout and readable summary reason.
- `CheckpointStatusLabel` renders `checkpointScoreStatus` under the leaderboard with the next checkpoint level, required score, and shortfall list.
- Level score summaries wait for the current score popup batch to fade, then show complete/failed state, exact/overbuild result, team score, MVP, finisher, and per-player level/final totals before auto-hiding from `levelSummaryDelayMs`.
- Refresh button sends `refresh_blocks`.
- Skin selection reads `corp_tower/ui_skin`; default is `DefaultSkin`, with `Figma_SkinV1` available as a reskin.
- The skin picker button swaps the active skin scene under `SkinRoot`, rebinds required nodes, reconnects skin-local buttons, and replays the last room/game state.
- Debug overlay controls route changes through `NetworkManager.update_config` and use no-signal setters during server sync.
- Debug overlay header includes Reset, which sends `resetDebugConfig` and lets the server rebroadcast default values.
- Debug overlay is tabbed into Bots, Round, UI, Supply, Refresh, and Scoring controls.
- Round tuning includes `debugStartLevel`; Scoring tuning includes `checkpointMinContributionShare`.
- `update_room_closed(data)` resets stale room UI.

## Inputs/Outputs
- Input: signals from [[NetworkManager]].
- Output: player action calls to [[NetworkManager]].

## Dependencies
- [[NetworkManager]]
- [[Godot Client App]]

## Notes
- UI is an Android-first gameplay HUD with top status, center tower stage, and bottom touch controls.
- Bottom controls are laid out as 3 inventory card positions, 1 shared next-draw preview card, and the refresh button.
- Current working UI is preserved as `DefaultSkin`; Figma-inspired UI is `Figma_SkinV1`.
- Debug and skin menu UI are available as bottom-right floating buttons with overlay panels.
- The center tower is visual only; placement is still server-authoritative and index-based.
