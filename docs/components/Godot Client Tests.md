# Godot Client Tests

## Purpose
Godot-side client smoke and unit-test coverage. Files:
`src/Client/App/corp-tower/Tests/CiSmokeTest.gd`,
`src/Client/App/corp-tower/Tests/Gut/test_player_colors.gd`.

## Responsibilities
- Load application scripts under `Cor` and `Sys` (catches load-time/syntax
  errors before they reach CI's build step).
- Verify the main scene and `NetworkManager` autoload wiring.
- Verify the [[Game UI Scene]] loads and instantiates, with every node the
  controller requires present.
- Verify [[Player Colors]] utility behavior through GUT.

## Public interface
Run headlessly through the vendored GUT framework (`addons/gut`), invoked by
[[Client Android Internal Workflow]] before a signed Android export.

## Depends on
- Internal: [[Godot Client App]], [[NetworkManager]], [[Main UI Controller]],
  [[Game UI Scene]], [[Player Colors]]
- External: GUT (Godot Unit Test), vendored under `addons/gut`

## Notes
- Coverage is structural, not behavioral, for almost everything except
  [[Player Colors]]: `CiSmokeTest.gd` confirms scripts/scenes load and
  instantiate without error, but doesn't exercise gameplay logic.
  [[Main UI Controller]], [[NetworkManager]], [[Block Preview]],
  [[Tower Stack]], [[Cooldown Overlay]], and [[Debug Overlay]] have no
  behavioral test
  coverage today — worth keeping in mind before larger refactors there.
