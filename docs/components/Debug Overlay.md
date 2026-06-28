# Debug Overlay

## Purpose
- Lightweight show/hide shell for the Godot debug tuning panel.
- File: `src/Client/App/corp-tower/Cor/Scripts/DebugOverlay.gd`.

## Runtime Classification
- Runtime client UI file for debug/tuning controls.
- Current UI skins reference it, so it is part of the current Godot client runtime.
- Core gameplay logic could run without debug tuning only if the skins/controller were adjusted.

## Responsibilities
- Toggle debug panel visibility.
- Keep dim layer and panel visibility synchronized.

## Dependencies
- [[Main UI Controller]]
- [[Client UI Skins]]

## Notes
- Debug control binding and server sync live in [[Main UI Controller]].
- Server-side validation lives in [[Lobby Manager]] and [[Game Config]].
