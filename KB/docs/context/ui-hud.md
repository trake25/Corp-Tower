# Gameplay HUD and Tower View

Scope: client rendering, gameplay input, HUD state, overlays, Tower Stack presentation, and client-side navigation/placement presentation. The client renders `game_state`; it never decides gameplay outcomes.

<!-- kb
id: hud.controller.state-application
alias: Game UI controller
alias: Main.gd
source: src/Client/App/corp-tower/Cor/Scripts/Main.gd#update_game_state
adjacent: network.state.snapshot
-->
## State application

The Game UI controller family stores the latest authoritative state and delegates roster, top bar, inventory, quest, popup, Power, summary, debug, and visual-hook presentation. Broadcasts update grid/site, roster and Impact state, redraw tower/inventory, consume transient events, then present overlays. The round clock interpolates from the latest server deadline.

<!-- kb
id: hud.controller.parallel-placement
alias: tap placement
alias: armed placement
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/InventoryController.gd#_aim_or_place
adjacent: hud.placement.armed
-->
## Parallel placement

Parallel placement is an accessibility alternative to dragging: select a card, aim on the tower, then confirm the same resolved position. A changed aim updates preview rather than placing accidentally, and every broadcast revalidates the armed position because another player may fill it first.

<!-- kb
id: hud.players.presence
alias: disconnected player UI
alias: LEFT player
source: src/Client/App/corp-tower/Cor/Scripts/PlayerRailEntry.gd#set_entry
adjacent: network.room.active-leave
-->
## Player presence

Player rails follow authoritative roster membership and presence. Disconnected players use a distinct red/struck presentation, while retained leavers use a persistent LEFT state. A live transition to left may show one transient notice; initial/recovery snapshots only synchronize the durable state.

<!-- kb
id: hud.players.impact-bars
alias: Impact progress
alias: contribution bar
source: src/Client/App/corp-tower/Cor/Scripts/ImpactBar.gd#set_bar
adjacent: network.state.impact-status
-->
## Impact bars

Impact bars display canonical server contribution status only when supplied. They do not reconstruct eligible contribution from displayed score or add live level score a second time.

<!-- kb
id: hud.players.latency
alias: latency indicator
source: src/Client/App/corp-tower/Cor/Scenes/GameUI.tscn#LatencyIndicatorLabel
adjacent: network.messages.latency
-->
## Latency presentation

Latency visibility can be synchronized, but each client measures its own WebSocket RTT. Probes run only while shown and discard pending results after disable or disconnect; latency is never shared gameplay state.

<!-- kb
id: hud.overlays.summary
alias: Level Summary
alias: failure summary
source: src/Client/App/corp-tower/Cor/Scenes/LevelSummary.tscn#LevelSummaryOverlay
-->
## Summary overlay

Level Summary is a centered state overlay for completed, failed, and terminal outcomes. It composes player results, quest outcome, authoritative transition countdown, retry state on recoverable failure, and terminal return-to-Home countdown. Exact copy and measurements remain scene/controller details.

<!-- kb
id: hud.overlays.score-popups
alias: score event popup
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/ScorePopupController.gd#process_score_events
adjacent: network.state.transient-events
-->
## Score popups

Score popups consume and de-duplicate authoritative in-level placement, reinforcement, Critical Save, and tower-stability warning events. Aggregate/end-of-level events do not create duplicate popups.

<!-- kb
id: hud.overlays.popovers
alias: glass popover
alias: chat popover
alias: Power popover
alias: Quest popover
source: src/Client/App/corp-tower/Cor/Scripts/PopoverPanel.gd#open
-->
## Shared popovers

Chat, Power, and Quest use one anchored glass-popover behavior. Each positions from its trigger's live global rectangle; only one is open at a time. Trigger toggle, outside tap, and timer close the active card without pausing play. Quest can remain through starting freeze before normal auto-close resumes.

<!-- kb
id: hud.tower.pose
alias: tower pose
alias: lean rendering
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_displayed_pose_for_grid
adjacent: gameplay.tower.pose
adjacent: backend.stability.pose
-->
## Structural pose

Standing tower sections render authoritative presentation pose around their stressed support interfaces. Pose affects drawing only; canonical grid coordinates remain the intent/physics frame. Draw operations under pose transforms use local pivots, and unrelated grounded components retain independent presentation.

<!-- kb
id: hud.tower.weak-support
alias: worried brick
alias: red outline
alias: weak support
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_has_danger_outline
adjacent: gameplay.scoring.critical-save
adjacent: gameplay.tower.stability
-->
## Weak-support feedback

Standing critical supports receive emphasized danger presentation tied to their authoritative support stability. The worried brick/outline follows the rendered structural pose. Recovered and fallen supports lose that critical emphasis while warning-only modes may hide the numeric meter but preserve structural feedback.

<!-- kb
id: hud.tower.collapse.presentation
alias: tower collapse UI
alias: collapse framing
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_begin_collapse
adjacent: backend.stability.collapse
adjacent: hud.tower.collapse.recovery
-->
## Collapse presentation

Collapse captures the currently displayed structural transforms before applying a fallen snapshot so the visual fall begins from the pose already on screen. A deterministic collapse identity selects the presentation sequence. Placement world, platform, surviving tower, and debris remain on one continuous scroll basis.

<!-- kb
id: hud.tower.fallen
alias: collapse debris
alias: fallen blocks
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_newly_fallen_block_ids
adjacent: network.state.snapshot
-->
## Fallen bricks

Fallen bricks provide no height, collision, or snap points. Tower Stack animates only newly fallen entries, keeps survivors drawable during the fall, and does not replay persisted falls after reconnect. Debris linger begins only after settlement/recovery and is visual-only.

<!-- kb
id: hud.tower.impact-beat
alias: Impact Beat
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#play_impact_beat
-->
## Impact Beat

Impact Beat temporarily changes render scale/wave presentation and holds until Summary cancels it. Disabled, empty, or collapsing cases add no delay to gameplay presentation.

<!-- kb
id: hud.navigation.auto-follow
alias: auto scroll
alias: tower camera follow
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_sync_scroll_state
-->
## Automatic follow

Bricks keep fixed drawing size while placement, collapse, and parallax share one floating scroll state. Automatic scrolling frames the current useful tower height and resumes after temporary inspection or recovery sequences.

<!-- kb
id: hud.navigation.manual-inspection
alias: manual pan
alias: scroll down tower
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#pan_scroll_units
-->
## Manual inspection

During play, direct touch/mouse navigation can inspect below the automatic tower frame but cannot pan above its moving target. A lower inspection position remains stable while the tower grows until the player returns to automatic follow.

<!-- kb
id: hud.navigation.drop-top
alias: Drop UI
alias: Top button
alias: weak support navigation
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#navigate_to_trouble
adjacent: hud.tower.weak-support
-->
## Drop and Top

Drop travels to the deterministic offscreen critical support selected for inspection. Top returns smoothly to the normal frame and resumes automatic follow. These view controls never change placement intent or server physics.

<!-- kb
id: hud.tower.collapse.recovery
alias: collapse camera recovery
alias: pan after collapse
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_start_collapse_recovery
adjacent: hud.tower.collapse.presentation
adjacent: hud.navigation.auto-follow
-->
## Collapse recovery

Collapse recovery may hold the camera through the fall or move concurrently with debris according to the deterministic collapse identity. Recovery always terminates at the surviving tower's ordinary gameplay framing and does not chase rubble below it. Navigation/placement unlock only after both settlement and recovery are complete; zero-distance recovery completes immediately.

<!-- kb
id: hud.placement.snapping
alias: Snap Grid
alias: snap radius
alias: release row preview
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#resolve_snap
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/SnapGrid.gd#resolve
adjacent: gameplay.tower.placement
adjacent: network.placement.contract
-->
## Snapping

Snapping pairs dragged-brick outline vertices with platform/placed-brick snap points, rejects overlap or a footprint outside the authoritative site, and selects the nearest valid lattice pairing. The result is a release row; gravity still determines final contact. Outside snap radius, placement falls back to column aiming rather than dead-ending.

<!-- kb
id: hud.placement.armed
alias: armed action
alias: tap confirm
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/InventoryController.gd#revalidate_armed_placement
adjacent: hud.controller.parallel-placement
-->
## Armed placement

Armed placement stores canonical intent and revalidates it against each authoritative update. Presentation sequences, overlays, and recovery disable navigation/placement so stale visual intent cannot be submitted during transitions.

<!-- kb
id: hud.placement.ghost
alias: placement ghost
alias: contact marker
source: src/Client/App/corp-tower/Cor/Scripts/BlockPreview.gd#set_matched_vertex
adjacent: network.placement.contract
-->
## Ghost and contact marker

The ghost shows the aimed release position while the contact marker may show the post-gravity result. Client settle preview and legality mirror server placement/stability behavior; changes to that cross-boundary contract require both sides to move together.

<!-- kb
id: hud.placement.coordinates
alias: rendered coordinates
alias: canonical grid
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#grid_to_local
adjacent: gameplay.tower.pose
-->
## Rendered coordinate boundary

Placement projection may operate in rendered space while returning canonical grid intent for server validation. Screen shake stays inside drawing offsets, and structural pose has no whole-tower inverse once independent sections use different transforms.

<!-- kb
id: hud.constraint.rendered-verification
alias: collapse visual QA
alias: tower rendered QA
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_begin_collapse
adjacent: testing.client.rendered
-->
## Rendered verification

Tower Stack drag/collapse framing, parallax continuity, and overlay ordering require rendered verification. Headless structural tests cannot establish the final player-visible frame.
