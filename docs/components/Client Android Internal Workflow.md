# Client Android Internal Workflow

## Purpose
- Manual Android build and Google Play internal testing workflow.
- File: `.github/workflows/Client-Android-Internal.yml`.

## Responsibilities
- Run on the pinned GitHub runner image `ubuntu-24.04`.
- Download Godot `4.6.2.stable` Linux.
- Install Android SDK packages through `android-actions/setup-android`.
- Resolve the next Android version code from Google Play.
- Restore release keystore from secrets.
- Import/parse Godot project.
- Run GUT tests if installed.
- Export signed Android AAB.
- Upload AAB artifact.
- Optionally upload to Google Play internal track.

## Key Logic
- Trigger: manual `workflow_dispatch`.
- Inputs:
  - `version_code_override`
  - `version_name`
  - `upload_to_play`
- Version code:
  - Authenticates to the Google Play Android Publisher API using `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
  - Creates a temporary edit and reads every track for `com.galaxxigames.corptower`.
  - Uses the highest release `versionCodes[]` value across all tracks plus one.
  - Uses `1` when no Google Play release exists yet.
  - Allows `version_code_override` only when it is a positive integer greater than the detected Google Play maximum.
- Runner/action runtime:
  - Uses Node 24-compatible GitHub Action majors.
  - Avoids deprecated Node 20 compatibility flags.
  - Android SDK license acceptance is handled by the setup action instead of a manual shell pipe.
- GUT step:
  - Runs after project import.
  - Runs before signed export.
  - Skips if `addons/gut/gut_cmdln.gd` is absent.

## Inputs/Outputs
- Input: GitHub secrets, manual version name, and optional version code override.
- Output: signed `CorpTower.aab`, optional Google Play internal release.

## Dependencies
- [[Godot Client App]]
- `.github/godot/export_presets.android.ci.cfg`
- Google Play service account with Android Publisher API access and Play Console access to `com.galaxxigames.corptower`.

## Notes
- Current target platform is Android only.
- GUT tests should be added under `res://Tests`.
