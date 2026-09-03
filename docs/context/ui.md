# UI Screens and Navigation

Scope: Godot client shell, authentication, screen flow, and responsive root
behavior. Gameplay view → [ui-hud.md](./ui-hud.md). Tutorial →
[ui-tutorial.md](./ui-tutorial.md). Wire lifecycle →
[networking.md](./networking.md). File purposes and stable anchors →
[map/ui-screens.md](./map/ui-screens.md).

The client renders server state and never computes a gameplay outcome.

## Client shell

The project autoloads Network Manager and Auth Manager. Auth Manager owns the
persisted Supabase session, provider state, refresh timing, and one-shot request
transport; the connection path reads its current token without waiting. Main is
the application root and Screen Manager owns the active screen.

Build-time endpoint configuration controls WebSocket targets, debug/demo mode,
and whether provider sign-in is available. Empty committed auth values disable
sign-in. The debug UI gate is client-only: server debug writes still need admin
authorization before public release.

Web preserves the portrait aspect while mobile expands to the available logical
canvas. Gameplay art keeps aspect and either centers or follows an edge anchor;
background and overlay surfaces fill the root. Presentation transforms never
change placement coordinates.

## Screen flow

Screen Manager swaps scenes in one container and owns the floating debug entry.
The normal path is startup restoration, Sign-in when needed, Home, matchmaking
or Public Lobby, then Play. A restored session can skip Sign-in. Demo mode skips
Sign-in and the public lobby, joins directly, and readies its real seat because
bots are already ready.

Home opens Private Server creation and Join Server. Names are optional typing-only
fields. A private password is empty or four numeric digits; Create pads a nonempty
one-to-three-digit password with trailing zeroes before sending it, while Join
leaves invalid nonempty input for authoritative rejection. Join keeps Find Match
as the public path and uses its other fields only for private entry. Server IDs
use the generated eight-character alphabet and are the only paste-enabled field:
its local paste action replaces and normalizes clipboard text without navigating.
Password fields retain real digits while masking their presentation, and the
private-lobby password begins masked on each screen instance. Create keeps its
source form beneath a blocking wait. Join instead disables its source form around
an accepted request, shows connection status there, restores the same values after
rejection or transport failure, and enters Private Lobby directly on authoritative
success.
Home also opens Settings, whose Account branch presents guest or linked state from
the restored auth session metadata. Settings sign-out reuses the shared confirmation
modal, clears that session only after confirmation, and returns to Sign-in.
Private Lobby renders server info, fixed seats, host-only kick, readiness,
countdown, and disconnected names in red with a strikethrough; leave and kick
reuse the shared confirmation modal.

Network signals drive room entry, match start, teardown, navigation, and recovery.
Play Menu is a full-screen live overlay above the retained Play instance. The
entire ordinary Play presentation stays below that boundary, while the recovery
modal and Debug presentation are shell-level exceptions above it. Recovery keeps
the same Menu attached; terminal navigation supersedes it. Menu blocks gameplay
and debug input without pausing the match, and closing reveals the current tower,
camera, inventory, HUD, Summary, and connection state. Its music and sound switches
share persisted client presentation preferences with Settings but still have no
audio side effects.
During active-match recovery, a centred blocking modal keeps the current screen
visible while the client applies authoritative recovery state; gameplay and debug
input stay unavailable until it completes. Recovery timeout uses its explicit
continuation, while authoritative resume failure follows the server destination.
Private-lobby recovery instead keeps its screen and reserved seat without that
modal; server destination metadata alone routes Home, Join Server, or Private
Server after lifecycle exit.
Other close and failure routes retain their existing matchmaking or Home paths.
Lobby timeout and unexpected matchmaking disconnect use an auto-dismiss modal.
Terminal game over keeps Summary active until the server closes the room.

Find Match has no retained gameplay view. Public Lobby retains the gameplay root
only for its debug layer while resetting and suppressing gameplay presentation;
entering Play or a tutorial restores the gameplay layers.

Startup Splash preserves continuity while authentication and saved-room resume
are unresolved. A restored account with room identity waits there for
authoritative private-lobby, Play, or shell routing before Home can appear. On
Android it fills the startup viewport edge-to-edge and retains startup window
geometry until the first real screen handoff.
Authentication shows only configured providers. Android uses native providers
when available and falls back to browser OAuth; Web keeps the PKCE verifier in
same-tab session storage through the callback.

The debug entry is build-gated and changes available categories by screen:
Sign-in exposes local authentication controls, lobby exposes bots, and Play
exposes gameplay tuning. Drag position persists until a new app or room setup.

## Live constraints

- Do not use an editor quit cycle as a parse check; it can resave scenes and
  discard authored overrides. Use headless smoke/import or the real editor.
- Scene parents must precede children in the text format. Moving a UI row between
  containers requires moving its node block.
- Decorative and overlapping controls must pass pointer input through or they can
  swallow taps in visually empty regions.
- Mobile orientation uses Godot's current integer setting; a legacy string can
  silently coerce to landscape.
- Text-bearing buttons need explicit state colors or a child Label, because
  native hover/press colors can make text disappear.
- The authored editor viewport cannot expose wider-device layout or touch-event
  pairing. Resize the running client or use a device/rendered comparison.
