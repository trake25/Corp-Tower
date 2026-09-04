# UI Screens and Navigation

Scope: Godot client shell, authentication, screen flow, responsive root behavior, and shell-level recovery/navigation. Gameplay HUD contracts live in `ui-hud.md`; tutorial contracts live in `ui-tutorial.md`.

<!-- kb
id: ui.shell.core
alias: Screen Manager
alias: Main shell
source: src/Client/App/corp-tower/Cor/Scenes/Main.tscn#Main
source: src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd#_ready
-->
## Client shell

The project autoloads Network Manager and Auth Manager. Auth Manager owns the persisted authentication session and provider state; Main is the application root and Screen Manager owns the active screen. The client renders server outcomes rather than computing gameplay results.

<!-- kb
id: ui.shell.responsive
alias: responsive layout
alias: portrait root
source: src/Client/App/corp-tower/Cor/Scenes/Main.tscn#Main
-->
## Responsive root

Web preserves portrait framing while mobile expands to the available logical canvas. Gameplay art keeps its intended tower or edge anchor; background/overlay surfaces can fill the wider root. Presentation transforms never change placement coordinates.

<!-- kb
id: ui.control.pressed-state
alias: pressed state
alias: button pressed treatment
alias: card pressed state
source: src/Client/App/corp-tower/Cor/Scripts/PressTintButton.gd#_ready
source: src/Client/App/corp-tower/Cor/Themes/GameUITheme.tres#MenuCardButton/styles/pressed
-->
## Pressed control treatment

Pressed controls give immediate local feedback without changing the action they
invoke. Texture controls tint while held and restore on release; card and row
buttons use their pressed theme style while retaining the control's shape and
role. This is presentation feedback, not a selected, ready, or authoritative
game-state signal.

<!-- kb
id: ui.visual.glass-card
alias: glass card
alias: frosted card
alias: translucent card
source: src/Client/App/corp-tower/Cor/Themes/GameUITheme.tres#[sub_resource type="StyleBoxFlat" id="StyleBoxFlat_GlassPanel"]
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/UiStyles.gd#glass_panel
-->
## Glass card treatment

Glass cards are translucent light surfaces with a pale edge, rounded corners,
and a soft elevated shadow so overlays and transient panels remain distinct from
the playfield without becoming opaque. Reusable theme and runtime styles carry
that treatment; a screen-specific card may adapt its size or radius without
becoming a second visual system.

<!-- kb
id: ui.auth.presentation
alias: sign in screen
alias: oauth UI
source: src/Client/App/corp-tower/Cor/Scenes/SignInScreen.tscn#SignInScreen
adjacent: network.session.identity
adjacent: build.endpoint-auth.injection
-->
## Authentication screen

Authentication shows only configured providers. Android prefers native providers when available and falls back to browser OAuth; Web keeps its PKCE verifier through same-tab callback handling. Empty committed auth values disable sign-in capability.

<!-- kb
id: ui.startup.restoration
alias: saved room startup
alias: resume startup
source: src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd#_begin_authenticated_startup
adjacent: network.session.resume-only
adjacent: ui.startup.splash
-->
## Startup restoration

Startup restoration may skip Sign-in when the account session is valid. If saved room identity exists, Startup Splash remains until authoritative recovery routes to Private Lobby, Play, or a shell destination; Home must not flash before that decision.

<!-- kb
id: ui.home.navigation
alias: home screen
source: src/Client/App/corp-tower/Cor/Scenes/HomeScreen.tscn#HomeScreen
-->
## Home

Home is the shell hub for public matchmaking, private creation/join, Settings, and tutorial entry. Navigation transitions are owned by Screen Manager and network-driven room events rather than by gameplay logic.

<!-- kb
id: ui.private.create
alias: create private server
alias: private server screen
source: src/Client/App/corp-tower/Cor/Scenes/PrivateServerScreen.tscn#PrivateServerScreen
adjacent: network.room.private
-->
## Private Server creation

Private Server creation has player/server inputs local to that screen. Password is empty or four numeric digits; nonempty one-to-three-digit Create input is padded with trailing zeroes before submission. The source form remains beneath a blocking wait while a create request is pending.

<!-- kb
id: ui.private.join
alias: join server
alias: server id paste
source: src/Client/App/corp-tower/Cor/Scenes/JoinScreen.tscn#JoinScreen
adjacent: network.room.private
-->
## Join Server

Join Server supports both public Find Match and private join inputs. Server ID is the only paste-enabled field and normalizes the pasted value without navigation. Invalid nonempty private password remains for authoritative rejection rather than being silently rewritten. Accepted private join disables the source form while retaining values for rejection/transport recovery.

<!-- kb
id: ui.private-lobby.presentation
alias: private lobby UI
source: src/Client/App/corp-tower/Cor/Scenes/PrivateLobbyScreen.tscn#PrivateLobbyScreen
adjacent: network.room.private
-->
## Private Lobby presentation

Private Lobby renders server identity, fixed seats, host-only kick, readiness, countdown, and presence. Disconnected players are shown distinctly while reserved seat recovery remains in the lobby rather than presenting the active-match recovery modal. Leave and kick use the shared confirmation pattern.

<!-- kb
id: ui.settings.presentation
alias: settings screen
source: src/Client/App/corp-tower/Cor/Scenes/SettingsScreen.tscn#SettingsScreen
-->
## Settings

Settings presents account/session state and shared presentation preferences. Sign-out uses the shared confirmation flow, clears the authentication session only after confirmation, and returns to Sign-in. Music and sound switches may persist UI preference even while audio side effects are not yet implemented.

<!-- kb
id: ui.public-lobby.flow
alias: find match
alias: public lobby
source: src/Client/App/corp-tower/Cor/Scenes/PublicLobbyScreen.tscn#PublicLobbyScreen
adjacent: network.room.public
-->
## Public matchmaking and lobby

Find Match has no retained gameplay view. Public Lobby may retain the gameplay root only for its debug layer while suppressing gameplay presentation; entering Play or tutorial restores the gameplay layers. Unexpected matchmaking disconnect and lobby timeout use shell-level failure presentation.

<!-- kb
id: ui.play.menu
alias: burger menu
alias: play overlay
source: src/Client/App/corp-tower/Cor/Scenes/MenuScreen.tscn#MenuScreen
adjacent: hud.controller.state-application
-->
## Play Menu

Play Menu is a full-screen live overlay above the retained Play instance. Ordinary Play presentation remains underneath; recovery modal and Debug are shell-level exceptions above it. Menu blocks gameplay/debug input without pausing the authoritative match, and closing reveals the current live Play state.

<!-- kb
id: ui.play.recovery
alias: resync popup
alias: recovery modal
source: src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd#_on_recovery_started
adjacent: network.session.recovery
-->
## Active-match recovery

During active-match recovery, a centered blocking modal keeps the current Play screen visible while authoritative recovery state is applied. Gameplay and debug input remain unavailable until recovery finishes. Timeout follows its explicit continuation while authoritative resume failure follows the server-provided destination.

<!-- kb
id: ui.navigation.server-routes
alias: navigation destination
alias: room routing
source: src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd#_on_room_joined
source: src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#room_joined
adjacent: network.room.close
adjacent: network.session.resume-only
-->
## Server-driven navigation

Network signals own room entry, match start, teardown, recovery routing, and terminal destinations. Server destination metadata supersedes local guesses for resume failure, private-lobby expiry, and terminal room closure.

<!-- kb
id: ui.startup.splash
alias: extended splash
alias: startup splash
source: src/Client/App/corp-tower/Cor/Scenes/Main.tscn#%StartupSplash
adjacent: build.android.startup-splash
adjacent: ui.startup.restoration
-->
## Startup Splash

Startup Splash preserves continuity while authentication and saved-room recovery are unresolved. On Android it fills the startup viewport edge-to-edge and retains startup window geometry until the first real screen handoff.

<!-- kb
id: ui.debug.entry
alias: debug button
alias: debug panel entry
source: src/Client/App/corp-tower/Cor/Scripts/DebugOverlay.gd#toggle
adjacent: backend.lobby.debug-config
-->
## Debug entry

The debug entry is build-gated and changes categories by screen: authentication controls on Sign-in, bots in lobby, and gameplay tuning in Play. Drag position persists within the intended app/room lifecycle. Client gating never replaces server authorization of debug writes.

<!-- kb
id: ui.constraint.scene-order
alias: scene parent order
source: src/Client/App/corp-tower/Cor/Scenes/Main.tscn#ScreenContainer
-->
## Scene text-format constraint

Godot text scenes require parents to appear before children. Moving a UI row between containers requires moving the corresponding node block, not only changing a parent string.

<!-- kb
id: ui.constraint.pointer-input
alias: mouse filter
alias: tap blocking
source: src/Client/App/corp-tower/Cor/Scenes/Main.tscn#%StartupSplash
-->
## Pointer pass-through

Decorative and overlapping controls set pointer filtering to pass or ignore when they are not intended hit targets, leaving the interactive sibling or underlying screen reachable. Visual transparency alone does not create input transparency, so an empty-looking overlay must not become accidental navigation authority.

<!-- kb
id: ui.constraint.rendered-verification
alias: visual verification
alias: device check
source: src/Client/App/corp-tower/Tests/CiSmokeTest.gd#check_main_scene_ready
adjacent: testing.client.rendered
-->
## Rendered verification

Editor viewport and headless structure cannot prove wider-device layout or touch-event pairing. Responsive and device-specific behavior requires a running resized client or rendered/device comparison.
