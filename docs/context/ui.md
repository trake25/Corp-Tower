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

- `project.godot` autoloads NetworkManager as a singleton.
- Display: 412×917 portrait design size, `canvas_items` stretch. Aspect is
  `keep` on web and mobile (`.web`/`.mobile`), pillarboxed rather than
  widened — most `GameUI.tscn` children are fixed-offset, not edge-anchored.
- `Main.tscn` is the app root and owns [Screen Manager](#screen-manager). It swaps
  join / find-match / instanced [Game UI Scene](./ui-hud.md#game-ui-scene) — there is no
  static UI root scene.
- Default font: Poppins, via `Theme.default_font` on `GameUITheme.tres` —
  inherited everywhere. A heavier weight is a per-`Label` font override.
- Android export config is the gitignored `export_presets.cfg`; CI uses a
  non-secret preset → [build.md](./build.md#android-deploy-wstodplay-workflow).
- Release target is **Android only**. Web/Windows/iOS are future.
- Two build-time flags from `EndpointConfig`, written per build by
  `write-endpoint-config.sh`: `DEBUG_UI_ENABLED` gates the debug button, off for
  the EKS web builds and the public demo; `DEMO_MODE_ENABLED` gates the required
  `DemoModeLabel` node disclosing that empty seats are bots, set only for
  `toddemo`.

There is **one** gameplay UI scene and no skin system.

The debug gate is UI-only. `update_config`/`resetDebugConfig` still have **no
server-side auth check** — full gating needs that before public release.

## Screen Manager

`Cor/Scripts/ScreenManager.gd`, on `Main.tscn`. Owns screen flow and the single
global floating debug button.

- Swaps sign-in / home / join / find-match / public-lobby / live Game UI Scene
  inside `ScreenContainer`, driven by the child screens' request signals and
  NetworkManager's `room_joined` / `match_started` / `room_closed`.
- Flow: Play Loader → Sign-in → Home → Join Screen; tutorial exit → Home,
  room-close → Join Screen. Demo skips both: Play Demo + Tutorial on Home,
  room-close → Home. Wired/stub buttons: [map/ui-screens.md](./map/ui-screens.md).
- **`room_joined` no longer means "play now"** — it branches on `matchStarted`
  (false → Public Lobby); `match_started` enters the game. `room_closed:
  lobby_timeout` opens `AutoDismissModal` over the current screen instead of
  swapping it away; other reasons → Join Screen (Home in demo) →
  [networking.md](./networking.md).
- `AutoDismissModal` (`Main.tscn`, third child) also covers an unexpected
  disconnect while `find_match_active`. Both cases tear the screen underneath
  down only on dismiss, so it stays visible behind the modal's 3s countdown.
- No status bar is drawn — the OS supplies its own on mobile; web has none.
- Instantiates `PlayScreenScene` on entering Find Match or the lobby, frees it on
  close.
- Debug button: tap vs drag via `DEBUG_BUTTON_DRAG_THRESHOLD`; *visible* from
  `DEBUG_UI_ENABLED`, *enabled* only with a live play instance exposing
  `toggle_debug_overlay()` and `is_conn_estab`. Position resets on `_ready()` and
  room join, never after a drag, so a drag persists to the next join.
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
- **The editor cannot validate web layout.** `expand` and `keep` produce genuinely
  different viewport sizes and coincide only at 412×917 — which is exactly what the
  editor runs at. Popover mis-positioning and trigger-tap timing are likewise not
  reproducible in the editor. Verify on a deployed build.
