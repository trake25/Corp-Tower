# Client Android Internal Workflow

## Purpose
- Manual Android build and Google Play internal testing workflow.
- File: `.github/workflows/Client-Android-Internal.yml`.

## Responsibilities
- Download Godot `4.6.2.stable` Linux.
- Install Android SDK packages.
- Restore release keystore from secrets.
- Import/parse Godot project.
- Run GUT tests if installed.
- Export signed Android AAB.
- Upload AAB artifact.
- Optionally upload to Google Play internal track.

## Key Logic
- Trigger: manual `workflow_dispatch`.
- Inputs:
  - `version_code`
  - `version_name`
  - `upload_to_play`
- GUT step:
  - Runs after project import.
  - Runs before signed export.
  - Skips if `addons/gut/gut_cmdln.gd` is absent.

## Inputs/Outputs
- Input: GitHub secrets and manual version values.
- Output: signed `CorpTower.aab`, optional Google Play internal release.

## Dependencies
- [[Godot Client App]]
- `.github/godot/export_presets.android.ci.cfg`
- Google Play service account.

## Notes
- Current target platform is Android only.
- GUT tests should be added under `res://Tests`.
