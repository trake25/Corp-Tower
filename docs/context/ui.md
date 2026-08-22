# UI — Screens & Navigation (Godot Client)

Scope: the Godot client's shell, screen flow, and the network layer that drives
it — which screen shows when, and how a build starts. Gameplay HUD, stack
rendering, popovers and the debug panel → [ui-hud.md](./ui-hud.md). Tutorial
layer → [ui-tutorial.md](./ui-tutorial.md). Wire protocol →
[networking.md](./networking.md). Tests →
[testing.md](./testing.md#godot-client-tests). Per-symbol file and line → grep
[map/ui-screens.md](./map/ui-screens.md).

All paths under `src/Client/App/corp-tower/` unless noted. **The client renders
`game_state` and never computes a gameplay outcome.**

## Godot Client App (shell)

- `project.godot` autoloads NetworkManager and `AuthManager` (`Sys/Auth/`), which
  owns the Supabase session in `user://` and refreshes it on a timer so the
  connect path never awaits — NetworkManager just reads `access_token()`.
  `Auth_Request_Transport.gd` owns one-shot Supabase HTTP request lifetime,
  headers and response parsing; the autoload retains session and provider state.
- Display: 412×917 portrait design size, `canvas_items` stretch, `keep` aspect
  on web (`.web`, pillarboxed), `expand` on mobile (`.mobile`) to fill device
  edges — `GameUI.tscn`'s fixed-offset HUD sits under `PlayField`'s origin, so
  extra canvas only adds background beneath it.
- `Main.tscn` is the app root and owns [Screen Manager](#screen-manager); there is
  no static UI root scene.
- `export_presets.cfg` is gitignored; CI uses a non-secret preset →
  [build.md](./build.md#android-deploy-wstodplay-workflow).
- Build-time flags from `EndpointConfig`, written per build by
  `write-endpoint-config.sh`: `DEBUG_UI_ENABLED` gates the debug button, off for
  the EKS web builds and the public demo; `DEMO_MODE_ENABLED` gates the required
  `DemoModeLabel` node disclosing that empty seats are bots, set only for
  `toddemo`; `SUPABASE_URL`/`SUPABASE_ANON_KEY` enable sign-in — **both empty
  (the committed default) disables AuthManager**; `AUTH_OAUTH_ENABLED`,
  `AUTH_REDIRECT_WEB`, `AUTH_GOOGLE_SERVER_CLIENT_ID` add provider sign-in.

`update_config`/`resetDebugConfig` have **no server-side auth check** — the debug
gate is UI-only, and needs one before public release.

## Screen Manager

`Cor/Scripts/ScreenManager.gd`, on `Main.tscn`. Owns screen flow and the single
global floating debug button.

- Sign-in shows a social button **only for a provider in `AuthManager.PROVIDERS`
  with OAuth on**, hiding the row and divider otherwise — no dead social button
  ships. Android returns via the vendored Deeplink plugin; web reloads at its
  configured URL and holds the one-time PKCE verifier in same-tab session storage
  until the callback exchange completes.
  Its debug Sign In category can locally force Google or Facebook through browser
  OAuth by disabling the default-on native Android path; both runtime-only
  preferences reset to enabled when the app reloads.
- Swaps screens inside `ScreenContainer`, driven by the child screens' request
  signals and NetworkManager's `room_joined` / `match_started` / `room_closed`.
- Flow: Play Loader → Sign-in → Home → Join Screen; a restored session skips
  Sign-in. Tutorial exit → Home, room-close → Join Screen. Demo skips both:
  Play Demo + Tutorial on Home, room-close → Home. Buttons:
  [map/ui-screens.md](./map/ui-screens.md).
- Routes `room_joined` on `matchStarted` (false → Public Lobby); `match_started`
  enters the game → [networking.md](./networking.md). **Demo skips the Public
  Lobby**: it enters play immediately and calls `send_ready()` itself, since bots
  pre-ready every other seat. `room_closed: lobby_timeout` opens
  `AutoDismissModal` over the current screen instead of swapping it away; other
  reasons → Join Screen (Home in demo).
- `AutoDismissModal` (`Main.tscn`, third child) also covers an unexpected
  disconnect while `find_match_active`. Both cases tear the screen underneath
  down only on dismiss, so it stays visible behind the modal's 3s countdown.
- No status bar is drawn — the OS supplies its own on mobile; web has none.
- Instantiates `PlayScreenScene` on entering Find Match or the lobby, frees it on
  close.
- Debug button: tap vs drag via `DEBUG_BUTTON_DRAG_THRESHOLD`; *visible* from
  `DEBUG_UI_ENABLED`, and enabled on Sign In, Public Lobby, and Play only.
  Sign In enables only its local Sign In category, Public Lobby only Bots, and
  Play every gameplay category; unrelated categories remain visible but disabled.
  Position resets on `_ready()` and room join, never after a drag, so a drag
  persists to the next join.
- Calls into Main by duck typing (`play_instance.call(...)`) — no static
  dependency on it.

## Landmines

- **Never run `godot --editor --quit`.** Its import/parse pass re-saves `.tscn`
  and drops authored overrides — `custom_minimum_size`, `stretch_mode`,
  `layout_mode` — silently. Edit scenes by hand or in the real editor. If it has
  run, `git checkout` the scene and re-apply.
- **A `.tscn` declares parents before children.** A row node must sit after its
  container in file order, or it draws a `Parent path … has vanished` warning and
  disappears. Moving a row between categories means moving its node block too.
- **`mouse_filter = 2` on every decorative or overlapping node.** Godot's default
  `0` (stop) makes a Control swallow touches even where it draws nothing.
- **`window/handheld/orientation` must be the Godot 4 integer `1`.** A Godot
  3-style string silently coerces to `0` (landscape) with no warning, and the
  string form *looks* correct — check it first if orientation regresses.
- **A `Button`'s native `text` goes near-invisible on hover/press** unless
  `font_hover_color`/`font_pressed_color` are also set — they default to a light
  colour. Every text-bearing button instead uses `text = ""` plus a child
  `Label` (fixed `font_color`), outside `Button`'s state colours entirely.
- **The editor viewport is fixed at 412×917**, where `expand` and `keep`
  coincide — it can't show device-size layout, popover mis-positioning, or
  trigger-tap timing. Resize the running desktop client instead, or verify on
  a deployed build.
