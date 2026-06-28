# Godot Client Tests

## Purpose
- Godot-side client smoke and GUT coverage.
- Files:
  - `src/Client/App/corp-tower/Tests/CiSmokeTest.gd`
  - `src/Client/App/corp-tower/Tests/Gut/test_player_colors.gd`

## Responsibilities
- Load application scripts under `Cor` and `Sys`.
- Verify main scene and `NetworkManager` autoload wiring.
- Verify required UI skins load and instantiate.
- Verify player color utility behavior through GUT.

## Inputs/Outputs
- Input: [[Client Android Internal Workflow]].
- Output: CI pass/fail before signed Android export.

## Dependencies
- [[Godot Client App]]
- [[NetworkManager]]
- [[Main UI Controller]]
- [[Client UI Skins]]
- [[Player Colors]]
