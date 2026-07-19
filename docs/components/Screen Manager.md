# Screen Manager

## Purpose
App-level root controller that owns screen flow and the single global debug
toggle button. File: `src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd`,
attached to `Main.tscn` (the app's root scene).

## Responsibilities
- Swap between the join screen, find-match screen, and the live
  [[Game UI Scene]]/[[Main UI Controller]] pair inside `ScreenContainer`, in
  response to `find_match_requested`/`cancel_requested` (from the child
  screens) and [[NetworkManager]]'s `room_joined`/`room_closed` signals.
- Instantiate `PlayScreenScene` ([[Game UI Scene]]) once when a room is
  joined and free it when the room closes, rather than keeping it resident.
- Own a single floating, draggable debug button that sits above whichever
  screen is active (join, find-match, or play) rather than living inside any
  one of them.
- Distinguish a tap from a drag on the debug button via a movement-distance
  threshold (`DEBUG_BUTTON_DRAG_THRESHOLD`), so dragging it to reposition
  doesn't also toggle the panel.
- Gate the debug button's enabled state — disabled unless there is a live
  play instance with a `toggle_debug_overlay()` method and
  `NetworkManager.is_conn_estab` is true.

## Public interface
- `show_join_screen()`, `show_find_match_screen()` — swap the active
  non-gameplay screen.
- `reset_debug_button_position()` — snaps the debug button back to its
  default spot: top-right corner (`DEBUG_BUTTON_MARGIN` in from both edges),
  y no longer bottom-anchored. Called on `_ready()` and whenever a room is
  joined; does not run again after a manual drag, so a player's drag
  persists until the button resets on the next room join.
- `_on_debug_button_tapped()` — calls `play_instance.call("toggle_debug_overlay")`
  via duck typing (no static type dependency on [[Main UI Controller]]).

## Depends on
- Internal: [[NetworkManager]] (`room_joined`, `room_closed`,
  `status_changed`, `is_conn_estab`), [[Main UI Controller]] (duck-typed
  `toggle_debug_overlay()` call on the instanced play scene), the join and
  find-match scenes (`JoinScreen.tscn`/`JoinScreen.gd`,
  `FindMatchScreen.tscn`/`FindMatchScreen.gd` — both are thin: they only
  emit their request/cancel signal and, for find-match, mirror
  `NetworkManager.status_changed` into a label; not separately documented)
- External: none

## Notes
- The debug button's default position was bottom-right; it was moved to
  top-right so it doesn't collide with the join/find-match screens' primary
  action buttons, which tend to sit lower on the layout.
- The button is intentionally present in every build (no build flag or
  `SHOW_DEBUG_UI`-style constant) — see GDD `Debug Menu and Live Tuning` for
  the pre-release requirement to gate it behind a build flag or
  authorization before public release.
