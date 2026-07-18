# Debug Overlay

## Purpose
Lightweight show/hide shell for the Godot debug-tuning panel. File:
`src/Client/App/corp-tower/Cor/Scripts/DebugOverlay.gd`.

## Responsibilities
- Toggle debug panel visibility.
- Keep the dim layer and panel visibility in sync.

## Public interface
- Open/close toggle driven by [[Main UI Controller]]'s debug button handler;
  this script owns no gameplay or config state itself.

## Depends on
- Internal: none
- External: none

## Notes
- Debug control binding and server sync (the actual sliders/toggles and what
  they send) live in [[Main UI Controller]], not here — this file is purely
  the panel's visibility shell.
- Server-side validation of anything this panel sends lives in
  [[Lobby Manager]] and [[Game Config]].
- Referenced by both [[Client UI Skins]] scenes, so it's part of the current
  runtime; core gameplay could run without it if the skins/controller were
  adjusted to drop debug tuning entirely.
