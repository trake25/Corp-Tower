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

Network signals drive room entry, match start, teardown, navigation, and recovery.
During active-match recovery, a centred blocking modal keeps the current screen
visible while the client applies authoritative recovery state; gameplay and debug
input stay unavailable until it completes. A terminal resume result routes to
matchmaking through an explicit continuation. Ordinary close returns to
matchmaking; terminal failure or an explicit Home destination returns Home.
Lobby timeout and unexpected matchmaking disconnect use an auto-dismiss modal.
Terminal game over keeps Summary active until the server closes the room.

Find Match has no retained gameplay view. Public Lobby retains the gameplay root
only for its debug layer while resetting and suppressing gameplay presentation;
entering Play or a tutorial restores the gameplay layers.

Startup Splash preserves continuity while session restoration is unresolved.
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
