# Gameplay HUD and Tower View

Scope: client-side rendering, gameplay input, HUD state, popovers, summaries,
debug controls, and Tower Stack presentation. Screen shell → [ui.md](./ui.md).
Server state contract → [networking.md](./networking.md). Source navigation →
[map/ui-hud.md](./map/ui-hud.md) and [map/ui-debug.md](./map/ui-debug.md).

The client renders `game_state`; it never decides legality, stability, scoring,
failure, progression, or another outcome.

## Game UI controller family

`Main.gd` is the gameplay view coordinator. It binds the composed scene once,
stores the latest authoritative state, and delegates focused work to controllers
for match state, player context/roster, top bar, inventory, quests, score popups,
Power, summary, debug state, and visual hooks. Controllers share node references
through the binder rather than rediscovering scene structure.

Each state update applies server grid/site values before drawing inventory or the
tower, refreshes roster and Impact status, redraws blocks and structural pose,
consumes transient events by id, and then presents state-specific overlays. The
round clock ticks locally from the most recent state deadline so starting,
playing, summary, and terminal countdowns remain smooth between broadcasts.

Rail totals may combine authoritative total with the current live level score
only while playing. Impact bars use canonical server contribution directly; it
already contains live eligible points and must not be reconstructed from display
score.

Parallel placement is an accessibility alternative to dragging: select a card,
aim on the tower, then confirm the same resolved position. A changed aim updates
the preview rather than placing accidentally. Every broadcast revalidates the
armed position because a teammate may fill it first.

Debug controls divide into server-backed tuning, synchronized presentation state,
and client-local accessibility/view controls. The client displays and sends
intent but never applies a server gameplay outcome locally. Screen Manager limits
which debug categories are meaningful in lobby and play.

## Gameplay scene and overlays

The Game UI scene composes the play field, tower, HUD, tutorial, debug panel,
summary, and transient overlay layers. Fixed game art retains aspect and remains
attached to its tower or edge anchor on wider Android roots; runtime surfaces may
expand. Popovers, score events, and summaries draw above player Impact progress.

The shared inventory bar exposes the communal pile and next draw. Player rails
follow authoritative roster membership. Impact bars show each player's progress
only when the server supplies status. Quest presentation has active and completed
room-wide states.

Level Summary is a centered state overlay for completed, failed, and terminal
outcomes. It composes player results, quest outcome, and the authoritative next
transition countdown. Failure uses retry state from the server; game over counts
down to Home. Exact copy and visual measurements live in the scene/controller,
not this knowledge base.

Score popups consume transient authoritative events and de-duplicate by id.
Placement classification comes from the server transaction. Aggregate events
that already have a dedicated HUD surface do not create duplicate popups.

## Popovers

Chat, Power, and Quest use one anchored glass-popover component. Each owner
positions its card from the trigger's live global rectangle. Only one is open at
a time; a trigger toggles current visibility, and outside tap or an auto-close
timer dismisses it without pausing play. Single-line clipping prevents content
from changing the authored card structure.

Quest remains presented through the starting freeze and restores ordinary
auto-close behavior afterward. Runtime Power toasts use the same glass visual
language but belong to the transient score layer.

## Tower Stack and snapping

The grid and placeable range are server-owned and updated on every broadcast.
Snap Grid keeps them as static state, and the renderer derives center from grid
width. Tests must reset the static range between cases.

Bricks stay at a fixed gameplay size while the tower view pans upward. Scrolling
begins only when needed, eases with progress, and freezes after target height so
overbuild remains visually attached. The Control-based renderer uses scalar
coordinate transforms rather than a `Camera2D`.

Snapping pairs every dragged-brick outline vertex with platform and placed-brick
snap points. It rejects overlap or a footprint outside the authoritative site,
then selects the nearest valid lattice pairing. The result is a release row;
gravity still determines final contact. Outside the snap radius, placement falls
back to column aiming instead of dead-ending. Support is not a legality filter.

The ghost displays the aimed position while the contact marker may show the
post-gravity result. Client `settle_origin_y` and legality are mirrors of server
Tower Stability; a change to either server function requires the matching client
change and full-stack verification.

Structural pose transforms standing sections for presentation. Placement
projection selects contacts in rendered space but returns canonical grid intent
for server validation. There is no valid inverse for a whole tower once different
sections carry different poses.

Fallen bricks provide no height, collision, or snap points. Tower Stack animates
only entries that newly transition to fallen, keeps survivor poses drawable
during the fall, and does not replay persisted falls after reconnect. The
server-owned visual-hook lifetime bounds debris visibility from the collapse
transition; repeated snapshots cannot restart that clock.

The Impact Beat temporarily changes the render scale and wave state, then holds
until Summary cancels it. It adds no delay when disabled, empty, or collapsing.
Collapse begins from displayed transforms but remains deterministic across
clients. Brick faces derive from placement-time Balance change and live cosmetic
thresholds; missing Balance data deliberately produces no face.

## Live integration constraints

- Snap preview clearing and drag termination are separate lifecycles; combining
  them destroys a drag when the pointer briefly leaves the drop zone.
- Physical touch can emit paired real/emulated events. Popovers, tooltips, and
  parallel placement keep short de-duplication/grace windows.
- Draw operations inside structural transforms must use the local pivot, while
  server intent remains in canonical grid coordinates.
- Screen shake stays inside drawing offsets. Feeding it into shared coordinate
  conversion corrupts collapse seeds and hit testing.
- Platform parallax snaps with tower redraw; easing it creates a growing gap.
  Background parallax may remain eased because it has no contact constraint.
- The background panel color follows the visible covered texture edge on wider
  roots, preventing a seam as parallax reveals the panel.
- Overlay root ordering matters globally: local child z-index cannot lift Impact
  progress above popovers or Summary.
- Tower Stack drag and collapse framing require rendered verification; headless
  structural tests cannot prove the final frame.
